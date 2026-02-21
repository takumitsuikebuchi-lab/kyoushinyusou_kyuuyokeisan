import { NextResponse } from "next/server";

/**
 * HRMOS認証: Secret KeyでBasic認証してトークンを取得
 */
async function authenticateHrmos(baseUrl, companyUrl, apiKey) {
  const authHeader = `Basic ${apiKey}`;
  const url = `${baseUrl}/api/${companyUrl}/v1/authentication/token`;

  console.log(`[HRMOS Auth] URL: ${url}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`認証失敗: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  return data.token;
}

/**
 * 月次勤怠データを取得
 */
async function fetchMonthlyAttendance(baseUrl, companyUrl, token, month) {
  const baseApiUrl = `${baseUrl}/api/${companyUrl}/v1/work_outputs/monthly/${month}`;
  const allRecords = [];
  let page = 1;
  const limit = 100;

  while (true) {
    const url = `${baseApiUrl}?limit=${limit}&page=${page}`;
    console.log(`[HRMOS Fetch] URL: ${url} (page ${page})`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`勤怠データ取得失敗: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) break;

    allRecords.push(...data);

    const totalPage = parseInt(response.headers.get('X-Total-Page') || '1');
    const totalCount = parseInt(response.headers.get('X-Total-Count') || '0');
    console.log(`[HRMOS Fetch] page ${page}/${totalPage}, got ${data.length} records (total: ${totalCount})`);

    if (page >= totalPage) break;
    page++;
  }

  console.log(`[HRMOS Fetch] 全ページ取得完了: ${allRecords.length}件`);
  return allRecords;
}

/**
 * 時間文字列（"HH:MM"）を分に変換
 */
function timeToMinutes(timeStr) {
  if (!timeStr && timeStr !== 0) return 0;
  if (typeof timeStr === 'number') return timeStr;
  const str = String(timeStr).trim();
  if (str === '' || str === '0' || str === '0:00' || str === '00:00') return 0;
  if (str.includes(':')) {
    const parts = str.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * 休日勤務の判定
 */
function isHolidayWork(segmentTitle) {
  if (!segmentTitle) return false;
  return segmentTitle.includes('休日') || segmentTitle.includes('祝日');
}

/**
 * 出勤日判定（休日系区分は出勤日数に含めない）
 */
function shouldCountWorkDay(record) {
  const actualWorkMinutes = timeToMinutes(record?.actual_working_hours);
  if (actualWorkMinutes <= 0) return false;

  const segmentTitle = String(record?.segment_title || '');
  const holidayKeywords = ['休日', '祝日', '公休', '振替休日'];
  return !holidayKeywords.some((keyword) => segmentTitle.includes(keyword));
}

/**
 * HRMOSのデータを給与計算用フォーマットに変換
 * HRMOS APIは日次データを返すので、ユーザーごとに月次集計する
 *
 * ※ HRMOS上で社員番号（number）が未設定のユーザーは自動的にスキップする。
 *   これにより、退職者や仮登録のままのユーザーが「未紐付けキュー」に入って
 *   自動計算をブロックする問題を防ぐ。
 */
function transformAttendanceData(hrmosData) {
  if (!Array.isArray(hrmosData)) {
    return [];
  }

  // ユーザーIDごとにグループ化
  const userMap = new Map();

  hrmosData.forEach(record => {
    // 社員番号（number）が未設定のユーザーはスキップ
    // → HRMOS上で番号が割り当てられていない仮登録・退職者等を除外する
    if (!record.number || String(record.number).trim() === '') {
      return;
    }

    const userId = record.user_id;

    if (!userMap.has(userId)) {
      userMap.set(userId, {
        employeeId: userId,
        employeeNumber: record.number,
        employeeName: record.full_name || record.user_name,
        workDays: 0,
        totalWorkMinutes: 0,
        overtimeMinutes: 0,
        prescribedMinutes: 0,
        lateNightMinutes: 0,
        holidayMinutes: 0,
        absenceDays: 0,
        paidLeaveDays: 0,
        records: []
      });
    }

    const user = userMap.get(userId);
    const segmentTitle = record.segment_title || '';
    const actualWorkMinutes = timeToMinutes(record.actual_working_hours);

    // 出勤日カウント（休日系区分は除外）
    if (shouldCountWorkDay(record)) {
      user.workDays++;
    }
    user.totalWorkMinutes += actualWorkMinutes;

    // 法定外残業 = excess_of_statutory_working_hours（平日）+ excess_of_statutory_working_hours_in_holidays（休日法定外）
    user.overtimeMinutes += timeToMinutes(record.excess_of_statutory_working_hours);
    user.overtimeMinutes += timeToMinutes(record.excess_of_statutory_working_hours_in_holidays);
    // 法定内残業（所定外・法定内）
    user.prescribedMinutes += timeToMinutes(record.hours_in_statutory_working_hours);
    // 深夜残業
    user.lateNightMinutes += timeToMinutes(record.late_night_overtime_working_hours);
    // 休日労働
    if (isHolidayWork(segmentTitle) && actualWorkMinutes > 0) {
      user.holidayMinutes += timeToMinutes(record.hours_in_statutory_working_hours_in_holidays);
    }

    // 欠勤チェック
    if (segmentTitle.includes('欠勤')) {
      user.absenceDays++;
    }

    // 有給休暇チェック
    if (segmentTitle.includes('有給')) {
      user.paidLeaveDays++;
    }

    user.records.push(record);
  });

  return Array.from(userMap.values()).map(user => ({
    employeeId: user.employeeNumber,
    employeeName: user.employeeName,
    workDays: user.workDays,
    totalWorkHours: (user.totalWorkMinutes / 60).toFixed(1),
    overtimeHours: (user.overtimeMinutes / 60).toFixed(1),
    prescribedHours: (user.prescribedMinutes / 60).toFixed(1),
    lateNightHours: (user.lateNightMinutes / 60).toFixed(1),
    holidayHours: (user.holidayMinutes / 60).toFixed(1),
    absenceDays: user.absenceDays,
    paidLeaveDays: user.paidLeaveDays,
    rawData: user.records,
  }));
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { baseUrl, companyUrl, apiKey, targetMonth } = body;

    if (!baseUrl || !companyUrl || !apiKey) {
      return NextResponse.json(
        { ok: false, message: "HRMOS設定が不足しています（Base URL / Company URL / API Key）" },
        { status: 400 }
      );
    }

    const month = targetMonth || new Date().toISOString().slice(0, 7);

    console.log(`[HRMOS Sync] 開始 - 対象月: ${month}, Company: ${companyUrl}`);

    console.log('[HRMOS Sync] 認証中...');
    const token = await authenticateHrmos(baseUrl, companyUrl, apiKey);
    console.log('[HRMOS Sync] 認証成功');

    console.log('[HRMOS Sync] 勤怠データ取得中...');
    const attendanceData = await fetchMonthlyAttendance(baseUrl, companyUrl, token, month);
    console.log(`[HRMOS Sync] データ取得成功: ${attendanceData.length || 0}件`);

    const transformedData = transformAttendanceData(attendanceData);
    console.log(`[HRMOS Sync] 変換完了: ${transformedData.length}名（社員番号未設定はスキップ済み）`);
    transformedData.forEach(d => {
      console.log(`  ${d.employeeName}(${d.employeeId}): workDays=${d.workDays}, OT=${d.overtimeHours}h, prescribed=${d.prescribedHours}h, night=${d.lateNightHours}h, holiday=${d.holidayHours}h`);
    });

    const responseData = transformedData.map(({ rawData, ...rest }) => rest);

    return NextResponse.json({
      ok: true,
      message: `HRMOS同期完了: ${responseData.length}件の勤怠データを取得`,
      syncedAt: new Date().toISOString(),
      month,
      data: responseData,
      recordCount: responseData.length,
    });

  } catch (error) {
    console.error('[HRMOS Sync] エラー:', error);

    return NextResponse.json({
      ok: false,
      message: `HRMOS同期エラー: ${error.message}`,
      error: error.message,
      syncedAt: new Date().toISOString()
    }, { status: 500 });
  }
}
