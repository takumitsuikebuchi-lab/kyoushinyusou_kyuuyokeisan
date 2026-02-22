"use client";
import React, { useState } from "react";

export const IconChevron = ({ open }) => <span className={`arrow${open ? " open" : ""}`}>▾</span>;

export const Tip = ({ label, children }) => {
    const [pos, setPos] = useState(null);
    const show = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setPos({ top: rect.bottom + 6, left: Math.max(8, rect.left + rect.width / 2 - 130) });
    };
    return (
        <span className="tip-wrap" onMouseEnter={show} onMouseLeave={() => setPos(null)}>
            {label}<span className="tip-icon">?</span>
            {pos && <span className="tip-body" style={{ display: "block", top: pos.top, left: pos.left }}>{children}</span>}
        </span>
    );
};

export const Card = ({ title, children, className }) => (
    <div className={`card${className ? ` ${className}` : ""}`}>
        {title && <div className="card-title">{title}</div>}
        {children}
    </div>
);

export const Badge = ({ variant = "default", children }) => (
    <span className={`badge badge-${variant}`}>{children}</span>
);

export const statusBadgeVariant = (status) => {
    if (status === "確定") return "success";
    if (status === "計算済") return "info";
    if (status === "計算中") return "warning";
    return "danger";
};

export const Collapsible = ({ title, defaultOpen = false, children }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="collapsible">
            <button className="collapsible-header" onClick={() => setOpen(!open)}>
                <span>{title}</span>
                <IconChevron open={open} />
            </button>
            {open && <div className="collapsible-body">{children}</div>}
        </div>
    );
};
