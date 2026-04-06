import React from "react";
import { HospitalSettings } from "../../../types/settings";
import { formatKoreanDate, maskResidentNumber } from "../../../utils/generateDocumentPdf";
import { renderPremiumHospitalFooter } from "./PremiumHospitalFooter";
import {
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

interface DiagnosisCertificateProps {
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
  diagnosisName: string;
  opinion: string;
  treatmentPlan: string;
  issueDate: Date;
}

export default function DiagnosisCertificate({
  hospital,
  patient,
  diagnosisName,
  opinion,
  treatmentPlan,
  issueDate,
}: DiagnosisCertificateProps) {
  const gender = patient.sex === "M" ? "남" : patient.sex === "F" ? "여" : "-";
  const issueDateText = formatKoreanDate(issueDate);

  return React.createElement(
    "div",
    { style: pageStyle },
    renderDocumentHeader({
      title: "진단서",
      subtitle: "DIAGNOSIS CERTIFICATE",
      hospitalName: hospital.hospitalNameKo,
      logoDataUrl: hospital.logoDataUrl,
      issuedDateText: issueDateText,
      documentCode: "DG",
    }),
    React.createElement(
      "div",
      { style: sectionStackStyle },
      renderInfoGrid(
        [
          { label: "환자명", value: patient.name || "-" },
          { label: "차트번호", value: patient.chartNumber || "-" },
          { label: "진단명", value: diagnosisName || "-" },
          { label: "발급기관", value: hospital.hospitalNameKo || "-" },
          { label: "진료과목", value: hospital.medicalDepartments || "-" },
          { label: "발급일", value: issueDateText },
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
        "진단 내용",
        React.createElement(
          "table",
          { style: tableStyle },
          React.createElement(
            "tbody",
            null,
            React.createElement(
              "tr",
              null,
              React.createElement("td", { style: { ...thStyle, width: "18%" } }, "진단명"),
              React.createElement("td", { style: { ...tdStyle, width: "82%" } }, diagnosisName || "-")
            ),
            React.createElement(
              "tr",
              null,
              React.createElement("td", { style: { ...thStyle, verticalAlign: "top" } }, "진단 소견"),
              React.createElement(
                "td",
                {
                  style: {
                    ...tdStyle,
                    whiteSpace: "pre-wrap",
                    verticalAlign: "top",
                    lineHeight: 1.55,
                    minHeight: "150px",
                  },
                },
                opinion || "-"
              )
            ),
            React.createElement(
              "tr",
              null,
              React.createElement("td", { style: { ...thStyle, verticalAlign: "top" } }, "향후 치료 의견"),
              React.createElement(
                "td",
                {
                  style: {
                    ...tdStyle,
                    whiteSpace: "pre-wrap",
                    verticalAlign: "top",
                    lineHeight: 1.55,
                    minHeight: "90px",
                  },
                },
                treatmentPlan || "-"
              )
            )
          )
        ),
        "의사가 확인한 진단 내용을 바탕으로 작성되었습니다."
      ),
      renderStatementBox(
        "상기 환자에 대한 진단 내용을 확인하여 본 진단서를 발급합니다.",
        "본 문서는 법적 제출 서류로 활용될 수 있습니다."
      ),
      renderIssueDateText(issueDateText)
    ),
    renderPremiumHospitalFooter(hospital, { doctorTitle: "의사" })
  );
}
