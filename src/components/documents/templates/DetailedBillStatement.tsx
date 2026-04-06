import React from "react";
import { HospitalSettings } from "../../../types/settings";
import { PaymentRecord, paymentService } from "../../../services/paymentService";
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

interface DetailedBillStatementProps {
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
  records: PaymentRecord[];
  dateRange: { from: string; to: string };
  issueDate: Date;
}

interface BillRowItem {
  date: string;
  itemName: string;
  itemType: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  status?: string;
}

function formatMoney(value: number) {
  return `${Math.max(0, value || 0).toLocaleString()}원`;
}

function normalizeStatus(status?: string) {
  if (status === "refunded") return "환불";
  if (status === "cancelled") return "취소";
  return "정상";
}

function statusTextColor(status?: string): string {
  if (status === "refunded") return "#b42318";
  if (status === "cancelled") return "#8a6472";
  return "#0f766e";
}

export default function DetailedBillStatement({
  hospital,
  patient,
  records,
  dateRange,
  issueDate,
}: DetailedBillStatementProps) {
  const allItems: BillRowItem[] = [];

  records.forEach((record) => {
    (record.items || []).forEach((item) => {
      allItems.push({
        date: record.paidAt,
        itemName: item.itemName,
        itemType: item.itemType,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        status: record.status,
      });
    });
  });

  allItems.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const grandClaimAmount = allItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
  const grandMembershipDeduction = records.reduce((sum, record) => sum + (record.membershipDeduction || 0), 0);
  const grandActualPaid = records.reduce((sum, record) => sum + paymentService.calcActualPaidAmount(record), 0);
  const grandDiscountOrAdjustment = Math.max(
    0,
    grandClaimAmount - grandMembershipDeduction - grandActualPaid
  );

  const issueDateText = formatKoreanDate(issueDate);
  const gender = patient.sex === "M" ? "남" : patient.sex === "F" ? "여" : "-";

  const typeLabel = (type: string) => {
    switch (type) {
      case "ticket":
        return "시술권";
      case "membership":
        return "회원권";
      case "treatment":
        return "시술";
      default:
        return type || "-";
    }
  };

  return React.createElement(
    "div",
    { style: pageStyle },
    renderDocumentHeader({
      title: "진료비 세부내역서",
      subtitle: "DETAILED BILL STATEMENT",
      hospitalName: hospital.hospitalNameKo,
      logoDataUrl: hospital.logoDataUrl,
      issuedDateText: issueDateText,
      documentCode: "BILL",
    }),
    React.createElement(
      "div",
      { style: sectionStackStyle },
      renderInfoGrid(
        [
          { label: "환자명", value: patient.name || "-" },
          { label: "차트번호", value: patient.chartNumber || "-" },
          { label: "주민등록번호", value: maskResidentNumber(patient.residentNumber) },
          { label: "조회기간", value: `${dateRange.from} ~ ${dateRange.to}` },
          { label: "결제건수", value: `${records.length}건` },
          { label: "상세항목 수", value: `${allItems.length}건` },
        ],
        3
      ),
      renderSectionCard(
        "환자 및 발급 정보",
        React.createElement(
          "table",
          { style: tableStyle },
          React.createElement(
            "tbody",
            null,
            React.createElement(
              "tr",
              null,
              React.createElement("td", { style: { ...thStyle, width: "13%" } }, "환자명"),
              React.createElement("td", { style: { ...tdStyle, width: "22%" } }, patient.name || "-"),
              React.createElement("td", { style: { ...thStyle, width: "13%" } }, "성별"),
              React.createElement("td", { style: { ...tdStyle, width: "10%" } }, gender),
              React.createElement("td", { style: { ...thStyle, width: "13%" } }, "생년월일"),
              React.createElement("td", { style: { ...tdStyle, width: "12%" } }, patient.birthDate || "-"),
              React.createElement("td", { style: { ...thStyle, width: "17%" } }, "발급일"),
              React.createElement("td", { style: { ...tdStyle, width: "20%" } }, issueDateText)
            ),
            React.createElement(
              "tr",
              null,
              React.createElement("td", { style: thStyle }, "발급기관"),
              React.createElement("td", { style: tdStyle, colSpan: 3 }, hospital.hospitalNameKo || "-"),
              React.createElement("td", { style: thStyle }, "진료과목"),
              React.createElement("td", { style: tdStyle, colSpan: 3 }, hospital.medicalDepartments || "-")
            )
          )
        )
      ),
      renderSectionCard(
        "진료비 상세 내역",
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
                { style: { ...thStyle, width: "7%", textAlign: "center" } },
                "No"
              ),
              React.createElement(
                "th",
                { style: { ...thStyle, width: "14%", textAlign: "center" } },
                "날짜"
              ),
              React.createElement(
                "th",
                { style: { ...thStyle, width: "25%", textAlign: "center" } },
                "항목명"
              ),
              React.createElement(
                "th",
                { style: { ...thStyle, width: "10%", textAlign: "center" } },
                "구분"
              ),
              React.createElement(
                "th",
                { style: { ...thStyle, width: "8%", textAlign: "center" } },
                "수량"
              ),
              React.createElement(
                "th",
                { style: { ...thStyle, width: "13%", textAlign: "center" } },
                "단가"
              ),
              React.createElement(
                "th",
                { style: { ...thStyle, width: "13%", textAlign: "center" } },
                "청구금액"
              ),
              React.createElement(
                "th",
                { style: { ...thStyle, width: "10%", textAlign: "center" } },
                "상태"
              )
            )
          ),
          React.createElement(
            "tbody",
            null,
            allItems.length === 0
              ? React.createElement(
                  "tr",
                  null,
                  React.createElement(
                    "td",
                    {
                      style: { ...tdStyle, textAlign: "center", color: colors.muted, padding: "12px 8px" },
                      colSpan: 8,
                    },
                    "해당 기간의 진료비 내역이 없습니다."
                  )
                )
              : allItems.map((item, index) =>
                  React.createElement(
                    "tr",
                    { key: `${item.date}-${item.itemName}-${index}` },
                    React.createElement(
                      "td",
                      {
                        style: {
                          ...tdStyle,
                          textAlign: "center",
                          backgroundColor: index % 2 === 0 ? "#fff" : "#f8fbff",
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
                          backgroundColor: index % 2 === 0 ? "#fff" : "#f8fbff",
                        },
                      },
                      new Date(item.date).toLocaleDateString("ko-KR")
                    ),
                    React.createElement(
                      "td",
                      {
                        style: {
                          ...tdStyle,
                          backgroundColor: index % 2 === 0 ? "#fff" : "#f8fbff",
                        },
                      },
                      item.itemName || "-"
                    ),
                    React.createElement(
                      "td",
                      {
                        style: {
                          ...tdStyle,
                          textAlign: "center",
                          backgroundColor: index % 2 === 0 ? "#fff" : "#f8fbff",
                        },
                      },
                      typeLabel(item.itemType)
                    ),
                    React.createElement(
                      "td",
                      {
                        style: {
                          ...tdStyle,
                          textAlign: "center",
                          backgroundColor: index % 2 === 0 ? "#fff" : "#f8fbff",
                        },
                      },
                      String(item.quantity || 0)
                    ),
                    React.createElement(
                      "td",
                      {
                        style: {
                          ...tdStyle,
                          textAlign: "right",
                          backgroundColor: index % 2 === 0 ? "#fff" : "#f8fbff",
                        },
                      },
                      formatMoney(item.unitPrice || 0)
                    ),
                    React.createElement(
                      "td",
                      {
                        style: {
                          ...tdStyle,
                          textAlign: "right",
                          fontWeight: 700,
                          backgroundColor: index % 2 === 0 ? "#fff" : "#f8fbff",
                        },
                      },
                      formatMoney(item.totalPrice || 0)
                    ),
                    React.createElement(
                      "td",
                      {
                        style: {
                          ...tdStyle,
                          textAlign: "center",
                          color: statusTextColor(item.status),
                          fontWeight: 700,
                          backgroundColor: index % 2 === 0 ? "#fff" : "#f8fbff",
                        },
                      },
                      normalizeStatus(item.status)
                    )
                  )
                )
          )
        ),
        "상태가 환불인 항목은 환불 처리된 결제건에 포함된 내역입니다."
      ),
      renderSectionCard(
        "총액 요약",
        React.createElement(
          "table",
          { style: { ...tableStyle, fontSize: "12px" } },
          React.createElement(
            "tbody",
            null,
            React.createElement(
              "tr",
              null,
              React.createElement("td", { style: { ...thStyle, width: "70%" } }, "총 청구금액(항목 합계)"),
              React.createElement(
                "td",
                { style: { ...tdStyle, textAlign: "right", fontWeight: 700 } },
                formatMoney(grandClaimAmount)
              )
            ),
            React.createElement(
              "tr",
              null,
              React.createElement("td", { style: thStyle }, "할인/조정"),
              React.createElement(
                "td",
                { style: { ...tdStyle, textAlign: "right", fontWeight: 700 } },
                formatMoney(grandDiscountOrAdjustment)
              )
            ),
            React.createElement(
              "tr",
              null,
              React.createElement("td", { style: thStyle }, "회원권 차감액"),
              React.createElement(
                "td",
                { style: { ...tdStyle, textAlign: "right", fontWeight: 700 } },
                formatMoney(grandMembershipDeduction)
              )
            ),
            React.createElement(
              "tr",
              null,
              React.createElement(
                "td",
                {
                  style: {
                    ...thStyle,
                    color: colors.accentDeep,
                    fontSize: "13px",
                    fontWeight: 800,
                    backgroundColor: "#e9f1ff",
                  },
                },
                "실 결제액"
              ),
              React.createElement(
                "td",
                {
                  style: {
                    ...tdStyle,
                    textAlign: "right",
                    fontWeight: 800,
                    fontSize: "16px",
                    color: colors.accentDeep,
                    backgroundColor: "#f2f7ff",
                  },
                },
                formatMoney(grandActualPaid)
              )
            )
          )
        )
      ),
      renderStatementBox(
        "위와 같이 조회 기간 내 진료비 및 결제 상세 내역을 확인합니다.",
        "총 청구금액, 회원권 차감액, 실 결제액은 서로 다른 집계 기준입니다."
      ),
      renderIssueDateText(issueDateText)
    ),
    renderPremiumHospitalFooter(hospital, { doctorTitle: "원장" })
  );
}
