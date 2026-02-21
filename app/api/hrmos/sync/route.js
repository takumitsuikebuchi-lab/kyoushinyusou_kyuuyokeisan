import { NextResponse } from "next/server";

/**
 * HRMOS認証: Secret KeyでBasic認証してトークンを取得
 */
async function authenticateHrmos(baseUrl, companyUrl, apiKey) {
  // Secret Keyはそのまま使用（既にBase64エンコード済みの形式）
  const authHeader = `Basic ${apiKey}`;
  const url = `${baseUrl}/api/${companyUrl}/v1/authentication/token`;

  console.log(`[HRMOS Auth] URL: ${url}`);
  console.log(`[HRMOS Auth] Authorization: Basic ${apiKey.substring(0, 10)}...`);

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
  const limit = 100; // 最大値

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

    // ページネーション: X-Total-Page ヘッダーで判定
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
  // 数値の場合: 分単位としてそのまま返す
  if (typeof timeStr === 'number') return timeStr;
  // 文字列に変換
  const str = String(timeStr).trim();
  if (str === '' || str === '0' || str === '0:00' || str === '00:00') return 0;
  // "HH:MM" 形式
  if (str.includes(':')) {
    const parts = str.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }
  // 純粋な数値文字列の場合: 分として扱う
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * 休日勤務の判定
 * segment_title に「休日」「祝日」等が含まれる場合は休日労働とみなす
 * ※実際のHRMOS勤務区分名は会社設定によるため、実データで判定条件を調整すること
 */
function isHolidayWork(segmentTitle) {
  if (!segmentTitle) return false;
  return segmentTitle.includes('休日') || segmentTitle.includes('祝日');
}

/**
 * MF表示合わせの出勤日判定
 * 休日系区分の実労働は残業計算には含めるが、出勤日数には含めない
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
 */
function transformAttendanceData(hrmosData) {
  if (!Array.isArray(hrmosData)) {
    return [];
  }

  // ユーザーIDごとにグループ化
  const userMap = new Map();

  hrmosData.forEach(record => {
    const userId = record.user_id;

    if (!userMap.has(userId)) {
      userMap.set(userId, {
        employeeId: userId,
        employeeNumber: record.number, // HRMOS の従業員番号
        employeeName: record.full_name || record.user_name,
        workDays: 0,
        totalWorkMinutes: 0,
        overtimeMinutes: 0,
        prescribedMinutes: 0,  // 法定内残業（所定外時間）
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

    // ===== [DEBUG] 残業関連フィールドの生値をログ出力 =====
    // 渡曾羊一など全従業員の日次rawデータを確認するため全件出力
    const otRaw = record.excess_of_statutory_working_hours;
    const otHolRaw = record.excess_of_statutory_working_hours_in_holidays;
    const preRaw = record.hours_in_statutory_working_hours;
    const nightRaw = record.late_night_overtime_working_hours;
    const holPreRaw = record.hours_in_statutory_working_hours_in_holidays;
    if (
      otRaw || otHolRaw || preRaw || nightRaw || holPreRaw
    ) {
      console.log(
        `[DEBUG RAW] ${user.employeeName}(${userId}) ${record.date || '?'} seg="${segmentTitle}"` +
        ` | actual=${record.actual_working_hours}` +
        ` | excess_statutory=${otRaw}` +
        ` | excess_statutory_holiday=${otHolRaw}` +
        ` | hours_in_statutory=${preRaw}` +
        ` | late_night=${nightRaw}` +
        ` | hours_in_statutory_holiday=${holPreRaw}` +
        ` => OT+=${timeToMinutes(otRaw) + timeToMinutes(otHolRaw)}min prescribed+=${timeToMinutes(preRaw)}min`
      );
    }
    // ===== [DEBUG END] =====

    // 出勤日カウント（休日系区分は除外）
    if (shouldCountWorkDay(record)) {
      user.workDays++;
    }
    user.totalWorkMinutes += actualWorkMinutes;

    // MFと同じ方式: 全日の残業を種別ごとに集計（休日分離しない）
    // 法定外残業 = excess_of_statutory_working_hours（平日） + excess_of_statutory_working_hours_in_holidays（休日法定外）
    user.overtimeMinutes += timeToMinutes(record.excess_of_statutory_working_hours);
    user.overtimeMinutes += timeToMinutes(record.excess_of_statutory_working_hours_in_holidays);
    // 法定内残業 = hours_in_statutory_working_hours（所定外・法定内）
    user.prescribedMinutes += timeToMinutes(record.hours_in_statutory_working_hours);
    // 深夜残業
    user.lateNightMinutes += timeToMinutes(record.late_night_overtime_working_hours);
    // 休日労働 = 休日の法定内労働時間
    if (isHolidayWork(segmentTitle) && actualWorkMinutes > 0) {
      user.holidayMinutes += timeToMinutes(record.hours_in_statutory_working_hours_in_holidays);
    }

    // 欠勤チェック
    if (segmentTitle.includes('欠勤')) {
      user.absenceDays++;
    }

    // 有給休暇のチェック（segment_titleが「有給」等の場合）
    if (segmentTitle.includes('有給')) {
      user.paidLeaveDays++;
    }

    user.records.push(record);
  });

  // Map を配列に変換
  return Array.from(userMap.values()).map(user => {
    // HRMOS の number フィールドを従業員IDとして使用
    // number が利用できない場合は hrmos_ プレフィックス付き user_id をフォールバック
    // （number が空の従業員の user_id が他の従業員の number と衝突するのを防ぐ）
    const employeeId = user.employeeNumber || `hrmos_${user.employeeId}`;

    // ===== [DEBUG] 月次集計サマリー =====
    console.log(
      `[DEBUG SUMMARY] ${user.employeeName}(${employeeId})` +
      ` workDays=${user.workDays}` +
      ` totalMin=${user.totalWorkMinutes}(${(user.totalWorkMinutes/60).toFixed(1)}h)` +
      ` OT=${user.overtimeMinutes}min(${(user.overtimeMinutes/60).toFixed(1)}h)` +
      ` prescribed=${user.prescribedMinutes}min(${(user.prescribedMinutes/60).toFixed(1)}h)` +
      ` night=${user.lateNightMinutes}min(${(user.lateNightMinutes/60).toFixed(1)}h)` +
      ` holiday=${user.holidayMinutes}min(${(user.holidayMinutes/60).toFixed(1)}h)`
    );
    // ===== [DEBUG END] =====

    return {
      employeeId: employeeId,
      employeeName: user.employeeName,
      workDays: user.workDays,
      totalWorkHours: (user.totalWorkMinutes / 60).toFixed(1),
      overtimeHours: (user.overtimeMinutes / 60).toFixed(1),
      prescribedHours: (user.prescribedMinutes / 60).toFixed(1),  // 法定内残業（所定外時間）
      lateNightHours: (user.lateNightMinutes / 60).toFixed(1),
      holidayHours: (user.holidayMinutes / 60).toFixed(1),
      absenceDays: user.absenceDays,
      paidLeaveDays: user.paidLeaveDays,
      rawData: user.records // デバッグ用に元データを保持
    };
  });
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { baseUrl, companyUrl, apiKey, targetMonth } = body;

    // バリデーション
    if (!baseUrl || !companyUrl || !apiKey) {
      return NextResponse.json(
        { ok: false, message: "HRMOS設定が不足しています（Base URL / Company URL / API Key）" },
        { status: 400 }
      );
    }

    // 対象月の設定（未指定の場合は当月）
    // HRMOS APIは YYYY-MM 形式を要求
    const month = targetMonth || new Date().toISOString().slice(0, 7);

    console.log(`[HRMOS Sync] 開始 - 対象月: ${month}, Company: ${companyUrl}`);

    // 1. 認証
    console.log('[HRMOS Sync] 認証中...');
    const token = await authenticateHrmos(baseUrl, companyUrl, apiKey);
    console.log('[HRMOS Sync] 認証成功');

    // 2. 月次勤怠データ取得
    console.log('[HRMOS Sync] 勤怠データ取得中...');
    const attendanceData = await fetchMonthlyAttendance(baseUrl, companyUrl, token, month);
    console.log(`[HRMOS Sync] データ取得成功: ${attendanceData.length || 0}件`);

    // 3. データ変換
    const transformedData = transformAttendanceData(attendanceData);
    console.log(`[HRMOS Sync] 変換完了: ${transformedData.length}名`);
    transformedData.forEach(d => {
      console.log(`  ${d.employeeName}(${d.employeeId}): workDays=${d.workDays}, OT=${d.overtimeHours}h, prescribed=${d.prescribedHours}h, night=${d.lateNightHours}h, holiday=${d.holidayHours}h`);
    });

    // rawData を除外してレスポンスを軽量化
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
