import React from "react";
import { HospitalSettings } from "../../../types/settings";
import { colors } from "./premiumDocumentTheme";

interface PremiumHospitalFooterOptions {
  doctorTitle?: string;
}

const labelStyle: React.CSSProperties = {
  fontSize: "10px",
  color: colors.muted,
  minWidth: "82px",
  fontWeight: 700,
};

const valueStyle: React.CSSProperties = {
  fontSize: "11px",
  color: colors.text,
  fontWeight: 600,
  flex: 1,
};

function infoRow(label: string, value: string) {
  return React.createElement(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "flex-start",
        gap: "6px",
        padding: "4px 0",
        borderBottom: `1px dashed ${colors.border}`,
      },
    },
    React.createElement("span", { style: labelStyle }, label),
    React.createElement("span", { style: valueStyle }, value || "-")
  );
}

export function renderPremiumHospitalFooter(hospital: HospitalSettings, options?: PremiumHospitalFooterOptions) {
  const stampUrl = hospital.stampHospitalDataUrl || hospital.stampDirectorDataUrl;
  const doctorTitle = options?.doctorTitle || "원장";
  const directorName = hospital.directorName || "-";
  const hospitalName = hospital.hospitalNameKo || "의료기관";

  return React.createElement(
    "div",
    {
      style: {
        marginTop: "4px",
        display: "flex",
        justifyContent: "center",
      },
    },
    React.createElement(
      "div",
      {
        style: {
          width: "100%",
          border: `1px solid ${colors.borderStrong}`,
          borderRadius: "12px",
          overflow: "hidden",
          background: "linear-gradient(180deg, #ffffff 0%, #f7fbff 100%)",
          boxShadow: "0 6px 14px rgba(15, 23, 42, 0.07)",
        },
      },
      React.createElement(
        "div",
        {
          style: {
            padding: "8px 12px",
            background: "linear-gradient(180deg, #f7fbff 0%, #edf4fd 100%)",
            borderBottom: `1px solid ${colors.borderStrong}`,
            fontSize: "10px",
            fontWeight: 800,
            color: colors.accentDeep,
            letterSpacing: "0.02em",
          },
        },
        "의료기관 정보"
      ),
      React.createElement(
        "div",
        {
          style: {
            padding: "10px 12px 10px",
          },
        },
        React.createElement(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "8px",
            },
          },
          React.createElement(
            "div",
            { style: { fontSize: "18px", fontWeight: 800, letterSpacing: "0.02em", color: colors.text } },
            hospitalName
          ),
          React.createElement(
            "span",
            {
              style: {
                fontSize: "9px",
                fontWeight: 700,
                color: "#334155",
                border: `1px solid ${colors.borderStrong}`,
                borderRadius: "999px",
                padding: "2px 8px",
                backgroundColor: "#f5f9ff",
                letterSpacing: "0.03em",
              },
            },
            "OFFICIAL"
          )
        ),
        infoRow("주소", hospital.address || "-"),
        infoRow("대표전화", hospital.phone || "-"),
        infoRow("팩스", hospital.fax || "-"),
        infoRow("사업자번호", hospital.businessNumber || "-"),
        infoRow("요양기관번호", hospital.providerNumber || "-"),
        React.createElement(
          "div",
          {
            style: {
              marginTop: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              minHeight: "52px",
            },
          },
          React.createElement(
            "span",
            {
              style: {
                fontSize: "14px",
                fontWeight: 700,
                letterSpacing: "0.01em",
                color: "#111827",
              },
            },
            `${doctorTitle} ${directorName}`
          ),
          stampUrl
            ? React.createElement("img", {
                src: stampUrl,
                style: {
                  position: "absolute",
                  right: "12%",
                  top: "-2px",
                  width: "64px",
                  height: "64px",
                  objectFit: "contain",
                  opacity: 0.78,
                  transform: "rotate(-7deg)",
                },
                alt: "직인",
              })
            : React.createElement(
                "span",
                {
                  style: {
                    marginLeft: "10px",
                    fontSize: "11px",
                    color: colors.muted,
                    fontWeight: 700,
                  },
                },
                "(직인)"
              )
        )
      )
    )
  );
}
