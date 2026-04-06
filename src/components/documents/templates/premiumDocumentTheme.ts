import React from "react";

interface HeaderOptions {
  title: string;
  subtitle?: string;
  hospitalName?: string;
  logoDataUrl?: string;
  issuedDateText?: string;
  documentCode?: string;
}

interface InfoGridItem {
  label: string;
  value: React.ReactNode;
}

export const colors = {
  text: "#0f172a",
  muted: "#5f7086",
  border: "#d7e2ee",
  borderStrong: "#bfd1e4",
  surface: "#ffffff",
  soft: "#f6f9fe",
  softStrong: "#ecf3fc",
  accent: "#1d4f91",
  accentDeep: "#0f2d5c",
  accentSoft: "#e6eefb",
  premium: "#a67b43",
};

export const pageStyle: React.CSSProperties = {
  width: "794px",
  minHeight: "1123px",
  padding: "20px 24px 24px",
  boxSizing: "border-box",
  fontFamily: '"Pretendard", "Noto Sans KR", "Malgun Gothic", "맑은 고딕", sans-serif',
  fontSize: "11.5px",
  color: colors.text,
  backgroundColor: "#fff",
  lineHeight: 1.45,
};

export const sectionCardStyle: React.CSSProperties = {
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: "12px",
  background: colors.surface,
  boxShadow: "0 6px 14px rgba(15, 23, 42, 0.04)",
  overflow: "hidden",
};

export const sectionHeaderStyle: React.CSSProperties = {
  padding: "8px 10px",
  background: "linear-gradient(180deg, #f8fbff 0%, #edf4fd 100%)",
  borderBottom: `1px solid ${colors.borderStrong}`,
  fontSize: "12px",
  fontWeight: 800,
  letterSpacing: "0.01em",
  color: colors.accentDeep,
};

export const sectionDescriptionStyle: React.CSSProperties = {
  padding: "6px 10px 0",
  color: colors.muted,
  fontSize: "10px",
};

export const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "11.5px",
};

export const thStyle: React.CSSProperties = {
  border: `1px solid ${colors.border}`,
  padding: "6px 8px",
  backgroundColor: "#f5f8fd",
  fontWeight: 700,
  color: "#1e293b",
  textAlign: "left",
  verticalAlign: "middle",
};

export const tdStyle: React.CSSProperties = {
  border: `1px solid ${colors.border}`,
  padding: "6px 8px",
  backgroundColor: "#fff",
  color: colors.text,
  textAlign: "left",
  verticalAlign: "middle",
};

export const sectionStackStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

export function renderSectionCard(title: string, content: React.ReactNode, description?: string) {
  return React.createElement(
    "div",
    { style: sectionCardStyle },
    React.createElement("div", { style: sectionHeaderStyle }, title),
    description ? React.createElement("div", { style: sectionDescriptionStyle }, description) : null,
    content
  );
}

export function renderInfoGrid(items: InfoGridItem[], columns = 2) {
  const gridColumns = `repeat(${Math.max(1, columns)}, minmax(0, 1fr))`;

  return React.createElement(
    "div",
    {
      style: {
        display: "grid",
        gridTemplateColumns: gridColumns,
        gap: "6px",
        border: `1px solid ${colors.borderStrong}`,
        borderRadius: "10px",
        background: "linear-gradient(180deg, #f9fbff 0%, #f2f7ff 100%)",
        padding: "8px",
      },
    },
    items.map((item, idx) =>
      React.createElement(
        "div",
        {
          key: `${item.label}-${idx}`,
          style: {
            border: `1px solid ${colors.border}`,
            borderRadius: "8px",
            backgroundColor: "#fff",
            padding: "6px 8px",
            minHeight: "42px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          },
        },
        React.createElement(
          "div",
          {
            style: {
              fontSize: "9.5px",
              color: colors.muted,
              fontWeight: 700,
              letterSpacing: "0.01em",
              marginBottom: "2px",
            },
          },
          item.label
        ),
        React.createElement(
          "div",
          {
            style: {
              fontSize: "12px",
              fontWeight: 700,
              color: colors.text,
              wordBreak: "break-word",
              lineHeight: 1.3,
            },
          },
          item.value ?? "-"
        )
      )
    )
  );
}

export function renderStatementBox(text: string, caption?: string) {
  return React.createElement(
    "div",
    {
      style: {
        textAlign: "center",
        fontSize: "12px",
        lineHeight: 1.55,
        padding: "10px",
        borderRadius: "10px",
        border: `1px solid ${colors.borderStrong}`,
        background: "linear-gradient(180deg, #f8fbff 0%, #f2f7fd 100%)",
        color: "#1e293b",
        fontWeight: 600,
      },
    },
    React.createElement("div", null, text),
    caption
      ? React.createElement(
          "div",
          {
            style: {
              marginTop: "3px",
              fontSize: "10px",
              color: colors.muted,
              fontWeight: 500,
            },
          },
          caption
        )
      : null
  );
}

export function renderIssueDateText(text: string) {
  return React.createElement(
    "div",
    {
      style: {
        textAlign: "center",
        fontSize: "13px",
        fontWeight: 700,
        letterSpacing: "0.01em",
        margin: "1px 0 4px",
      },
    },
    text
  );
}

export function renderDocumentHeader(options: HeaderOptions) {
  return React.createElement(
    "div",
    {
      style: {
        border: `1px solid ${colors.borderStrong}`,
        borderRadius: "14px",
        overflow: "hidden",
        marginBottom: "10px",
        boxShadow: "0 10px 20px rgba(15, 23, 42, 0.08)",
      },
    },
    React.createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          background:
            "linear-gradient(106deg, rgba(12,38,84,1) 0%, rgba(17,64,126,0.97) 56%, rgba(35,97,176,0.92) 100%)",
          color: "#fff",
        },
      },
      React.createElement(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "10px" } },
        options.logoDataUrl
          ? React.createElement("img", {
              src: options.logoDataUrl,
              alt: "병원 로고",
              style: {
                width: "30px",
                height: "30px",
                borderRadius: "8px",
                objectFit: "contain",
                backgroundColor: "rgba(255,255,255,.96)",
                padding: "3px",
              },
            })
          : null,
        React.createElement(
          "div",
          null,
          React.createElement(
            "div",
            { style: { fontSize: "13px", fontWeight: 800, letterSpacing: "0.01em" } },
            options.hospitalName || "의료기관"
          ),
          React.createElement(
            "div",
            { style: { fontSize: "9px", opacity: 0.9, marginTop: "0", letterSpacing: "0.02em" } },
            "OFFICIAL MEDICAL DOCUMENT"
          )
        )
      ),
      React.createElement(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "8px" } },
        options.documentCode
          ? React.createElement(
              "span",
              {
                style: {
                  fontSize: "9px",
                  fontWeight: 700,
                  padding: "3px 7px",
                  borderRadius: "999px",
                  backgroundColor: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.28)",
                  letterSpacing: "0.02em",
                },
              },
              options.documentCode
            )
          : null,
        React.createElement(
          "span",
          {
            style: {
              fontSize: "9px",
              fontWeight: 700,
              padding: "3px 8px",
              borderRadius: "999px",
              backgroundColor: "rgba(255,255,255,.14)",
              border: "1px solid rgba(255,255,255,.34)",
              letterSpacing: "0.03em",
            },
          },
          "CERTIFIED"
        )
      )
    ),
    React.createElement(
      "div",
      {
        style: {
          textAlign: "center",
          padding: "12px 16px 12px",
          background: "linear-gradient(180deg, rgba(248,251,255,0.92) 0%, rgba(255,255,255,1) 44%)",
        },
      },
      React.createElement(
        "div",
        {
          style: {
            fontSize: "40px",
            fontWeight: 800,
            color: colors.text,
            letterSpacing: "0.04em",
            marginBottom: "1px",
            lineHeight: 1.1,
          },
        },
        options.title
      ),
      React.createElement(
        "div",
        { style: { fontSize: "10px", color: colors.muted, letterSpacing: "0.03em" } },
        options.subtitle || ""
      ),
      options.issuedDateText
        ? React.createElement(
            "div",
            {
              style: {
                marginTop: "6px",
                display: "inline-block",
                fontSize: "9.5px",
                color: colors.accentDeep,
                border: `1px solid ${colors.borderStrong}`,
                backgroundColor: "#f8fbff",
                borderRadius: "999px",
                padding: "3px 8px",
              },
            },
            `발급일 ${options.issuedDateText}`
          )
        : null
    )
  );
}
