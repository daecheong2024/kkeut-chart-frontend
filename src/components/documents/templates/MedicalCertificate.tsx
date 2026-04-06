import React from "react";
import { HospitalSettings } from "../../../types/settings";
import { formatKoreanDate, maskResidentNumber } from "../../../utils/generateDocumentPdf";
import { renderPremiumHospitalFooter } from "./PremiumHospitalFooter";
import {
  colors,
  pageStyle,
  renderDocumentHeader,
  renderInfoGrid,
  renderIssueDateText,
  renderSectionCard,
  renderStatementBox,
  sectionStackStyle,
  tableStyle,
  tdStyle,
  thStyle,
} from "./premiumDocumentTheme";

interface MedicalCertificateProps {
  hospital: HospitalSettings;
  patient: {
    name: string;
    sex: string;
    birthDate?: string;
    residentNumber?: string;
    address?: string;
    phone?: string;
    chartNumber?: string;
  };
  visits: Array<{
    scheduledAt: string;
    memo?: string;
    category?: string;
  }>;
  purpose: string;
  issueDate: Date;
}

export default function MedicalCertificate({
  hospital,
  patient,
  visits,
  purpose,
  issueDate,
}: MedicalCertificateProps) {
  const sortedVisits = [...visits].sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  );
  const firstVisit = sortedVisits[0];
  const lastVisit = sortedVisits[sortedVisits.length - 1];
  const gender = patient.sex === "M" ? "남" : patient.sex === "F" ? "여" : "-";
  const issueDateText = formatKoreanDate(issueDate);
  const visitPeriodText =
    firstVisit && lastVisit
      ? `${formatKoreanDate(firstVisit.scheduledAt)} ~ ${formatKoreanDate(lastVisit.scheduledAt)}`
      : "-";

  return React.createElement(
    "div",
    { style: pageStyle },
    renderDocumentHeader({
      title: "진료확인서",
      subtitle: "VISIT CONFIRMATION",
      hospitalName: hospital.hospitalNameKo,
      logoDataUrl: hospital.logoDataUrl,
      issuedDateText: issueDateText,
      documentCode: "MC",
    }),
    React.createElement(
      "div",
      { style: sectionStackStyle },
      renderInfoGrid(
        [
          { label: "환자명", value: patient.name || "-" },
          { label: "성별", value: gender },
          { label: "차트번호", value: patient.chartNumber || "-" },
          { label: "발급용도", value: purpose || "-" },
          { label: "진료기간", value: visitPeriodText },
          { label: "총 내원건수", value: `${sortedVisits.length}건` },
        ],
        3
      ),
      renderSectionCard(
        "환자 인적사항",
        React.createElement(
          "table",
          { style: tableStyle },
          React.createElement(
            "tbody",
            null,
            React.createElement(
              "tr",
              null,
              React.createElement("td", { style: { ...thStyle, width: "15%" } }, "성명"),
              React.createElement("td", { style: { ...tdStyle, width: "35%" } }, patient.name || "-"),
              React.createElement("td", { style: { ...thStyle, width: "15%" } }, "주민등록번호"),
              React.createElement(
                "td",
                { style: { ...tdStyle, width: "35%" } },
                maskResidentNumber(patient.residentNumber)
              )
            ),
            React.createElement(
              "tr",
              null,
              React.createElement("td", { style: thStyle }, "성별"),
              React.createElement("td", { style: tdStyle }, gender),
              React.createElement("td", { style: thStyle }, "생년월일"),
              React.createElement("td", { style: tdStyle }, patient.birthDate || "-")
            ),
            React.createElement(
              "tr",
              null,
              React.createElement("td", { style: thStyle }, "연락처"),
              React.createElement("td", { style: tdStyle }, patient.phone || "-"),
              React.createElement("td", { style: thStyle }, "주소"),
              React.createElement(
                "td",
                { style: { ...tdStyle, whiteSpace: "pre-wrap" } },
                patient.address || "-"
              )
            )
          )
        )
      ),
      renderSectionCard(
        "진료 확인 개요",
        React.createElement(
          "table",
          { style: tableStyle },
          React.createElement(
            "tbody",
            null,
            React.createElement(
              "tr",
              null,
              React.createElement("td", { style: { ...thStyle, width: "18%" } }, "발급기관"),
              React.createElement(
                "td",
                { style: { ...tdStyle, width: "32%" } },
                hospital.hospitalNameKo || "-"
              ),
              React.createElement("td", { style: { ...thStyle, width: "18%" } }, "진료과목"),
              React.createElement(
                "td",
                { style: { ...tdStyle, width: "32%" } },
                hospital.medicalDepartments || "-"
              )
            ),
            React.createElement(
              "tr",
              null,
              React.createElement("td", { style: thStyle }, "진료기간"),
              React.createElement("td", { style: tdStyle }, visitPeriodText),
              React.createElement("td", { style: thStyle }, "최근 내원일"),
              React.createElement(
                "td",
                { style: tdStyle },
                lastVisit ? formatKoreanDate(lastVisit.scheduledAt) : "-"
              )
            ),
            React.createElement(
              "tr",
              null,
              React.createElement("td", { style: thStyle }, "발급일"),
              React.createElement("td", { style: tdStyle }, issueDateText),
              React.createElement("td", { style: thStyle }, "용도"),
              React.createElement("td", { style: tdStyle }, purpose || "-")
            )
          )
        )
      ),
      renderSectionCard(
        "진료 이력",
        React.createElement(
          "table",
          { style: tableStyle },
          React.createElement(
            "thead",
            null,
            React.createElement(
              "tr",
              null,
              React.createElement(
                "th",
                { style: { ...thStyle, width: "10%", textAlign: "center" } },
                "번호"
              ),
              React.createElement(
                "th",
                { style: { ...thStyle, width: "23%", textAlign: "center" } },
                "진료일자"
              ),
              React.createElement(
                "th",
                { style: { ...thStyle, width: "27%", textAlign: "center" } },
                "진료분류"
              ),
              React.createElement(
                "th",
                { style: { ...thStyle, width: "40%", textAlign: "center" } },
                "비고"
              )
            )
          ),
          React.createElement(
            "tbody",
            null,
            sortedVisits.length === 0
              ? React.createElement(
                  "tr",
                  null,
                  React.createElement(
                    "td",
                    {
                      style: {
                        ...tdStyle,
                        textAlign: "center",
                        color: colors.muted,
                        padding: "12px 8px",
                      },
                      colSpan: 4,
                    },
                    "선택된 진료 이력이 없습니다."
                  )
                )
              : sortedVisits.map((visit, index) =>
                  React.createElement(
                    "tr",
                    { key: `${visit.scheduledAt}-${index}` },
                    React.createElement(
                      "td",
                      {
                        style: {
                          ...tdStyle,
                          textAlign: "center",
                          backgroundColor: index % 2 === 0 ? "#fff" : colors.soft,
                        },
                      },
                      String(index + 1)
                    ),
                    React.createElement(
                      "td",
                      {
                        style: {
                          ...tdStyle,
                          textAlign: "center",
                          backgroundColor: index % 2 === 0 ? "#fff" : colors.soft,
                        },
                      },
                      formatKoreanDate(visit.scheduledAt)
                    ),
                    React.createElement(
                      "td",
                      {
                        style: {
                          ...tdStyle,
                          textAlign: "center",
                          backgroundColor: index % 2 === 0 ? "#fff" : colors.soft,
                        },
                      },
                      visit.category || hospital.medicalDepartments || "-"
                    ),
                    React.createElement(
                      "td",
                      {
                        style: {
                          ...tdStyle,
                          textAlign: "left",
                          backgroundColor: index % 2 === 0 ? "#fff" : colors.soft,
                        },
                      },
                      visit.memo || "-"
                    )
                  )
                ),
          )
        ),
        "내원 이력은 선택한 기록만 포함됩니다."
      ),
      renderStatementBox(
        "위 환자가 상기 기간 동안 본원에서 진료를 받았음을 확인합니다.",
        "본 문서는 행정 제출용으로 활용할 수 있습니다."
      ),
      renderIssueDateText(issueDateText)
    ),
    renderPremiumHospitalFooter(hospital, { doctorTitle: "원장" })
  );
}
