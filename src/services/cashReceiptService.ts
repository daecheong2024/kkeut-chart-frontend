import { kisTerminalService } from "./kisTerminalService";
import {
    paymentService,
    type CashReceiptIdentifierType,
    type CashReceiptPurpose,
    type CashReceiptTaskResponse,
    type UpdateCashReceiptResultRequest,
} from "./paymentService";

export interface CashReceiptIssueInput {
    purpose?: CashReceiptPurpose;
    identifierType?: CashReceiptIdentifierType;
    identifierValue?: string;
}

export interface ProcessCashReceiptTasksOptions {
    merchantTel?: string;
    issueInputsByPaymentDetailId?: Record<number, CashReceiptIssueInput | undefined>;
    onTaskProgress?: (task: CashReceiptTaskResponse, index: number, total: number) => void;
}

export interface ProcessCashReceiptTasksSummary {
    issuedCount: number;
    cancelledCount: number;
    unknownCount: number;
    manualActionCount: number;
    failedCount: number;
    skippedCount: number;
    messages: string[];
}

const COMPLETED_STATUSES = new Set([
    "issued",
    "cancelled",
    "manual_confirmed",
]);

function normalizeDigits(value?: string): string {
    return String(value || "").replace(/\D/g, "").trim();
}

function toPurpose(task: CashReceiptTaskResponse, input?: CashReceiptIssueInput): CashReceiptPurpose {
    const raw = String(input?.purpose || task.purpose || "").trim().toLowerCase();
    if (raw === "business") return "business";
    if (raw === "voluntary") return "voluntary";
    return "consumer";
}

function toIdentifierType(task: CashReceiptTaskResponse, input?: CashReceiptIssueInput): CashReceiptIdentifierType {
    const raw = String(input?.identifierType || task.identifierType || "").trim().toLowerCase();
    if (raw === "business_no") return "business_no";
    if (raw === "self_issued") return "self_issued";
    return "phone";
}

function isAmbiguousTerminalError(errorMessage: string): boolean {
    return /(응답 시간 초과|timeout|연결이 종료|응답 해석|응답 유실|확인 필요)/i.test(errorMessage);
}

function formatTaskLabel(task: CashReceiptTaskResponse): string {
    const txLabel = String(task.transactionType || "").toUpperCase() === "CANCEL" ? "현금영수증 취소" : "현금영수증 발급";
    return `${txLabel} ${Math.max(0, Math.round(task.amount || 0)).toLocaleString("ko-KR")}원`;
}

function buildUpdatePayload(
    task: CashReceiptTaskResponse,
    status: UpdateCashReceiptResultRequest["status"],
    options?: Partial<UpdateCashReceiptResultRequest>
): UpdateCashReceiptResultRequest {
    return {
        status,
        operationKey: task.operationKey,
        idempotencyKey: task.idempotencyKey,
        ...options,
    };
}

export async function processCashReceiptTasks(
    rawTasks: CashReceiptTaskResponse[] | undefined,
    options?: ProcessCashReceiptTasksOptions
): Promise<ProcessCashReceiptTasksSummary> {
    const uniqueTasks = Array.from(
        new Map((rawTasks || []).map((task) => [task.cashReceiptId, task])).values()
    );

    const summary: ProcessCashReceiptTasksSummary = {
        issuedCount: 0,
        cancelledCount: 0,
        unknownCount: 0,
        manualActionCount: 0,
        failedCount: 0,
        skippedCount: 0,
        messages: [],
    };

    for (let index = 0; index < uniqueTasks.length; index += 1) {
        const task = uniqueTasks[index]!;
        options?.onTaskProgress?.(task, index + 1, uniqueTasks.length);

        const status = String(task.status || "").trim().toLowerCase();
        if (COMPLETED_STATUSES.has(status)) {
            summary.skippedCount += 1;
            continue;
        }

        if (status !== "pending") {
            summary.manualActionCount += 1;
            summary.messages.push(`${formatTaskLabel(task)}: ${task.lastErrorMessage || "확인 필요 상태로 남았습니다."}`);
            continue;
        }

        const transactionType = String(task.transactionType || "").trim().toUpperCase();
        try {
            if (transactionType === "ISSUE") {
                const issueInput = options?.issueInputsByPaymentDetailId?.[task.paymentDetailId];
                const purpose = toPurpose(task, issueInput);
                const identifierType = toIdentifierType(task, issueInput);
                const identifierValue = identifierType === "self_issued"
                    ? undefined
                    : normalizeDigits(issueInput?.identifierValue);

                if (identifierType !== "self_issued" && !identifierValue) {
                    await paymentService.updateCashReceiptResult(
                        task.cashReceiptId,
                        buildUpdatePayload(task, "needs_manual_action", {
                            errorMessage: "현금영수증 식별값을 확인해 주세요.",
                        })
                    );
                    summary.manualActionCount += 1;
                    summary.messages.push(`${formatTaskLabel(task)}: 식별값이 없어 수기 확인 상태로 남겼습니다.`);
                    continue;
                }

                const terminalResult = await kisTerminalService.requestCashReceiptIssue({
                    amount: task.amount,
                    vatAmount: task.vatAmount,
                    svcAmount: 0,
                    purpose,
                    identifierType,
                    identifierValue,
                    merchantTel: options?.merchantTel,
                });

                if (terminalResult.success) {
                    await paymentService.updateCashReceiptResult(
                        task.cashReceiptId,
                        buildUpdatePayload(task, "issued", {
                            approvalNo: terminalResult.authNo,
                            approvalDate: terminalResult.replyDate,
                            providerTradeType: "CC",
                            providerAddInfo: terminalResult.addInfo || undefined,
                            providerTradeKey: terminalResult.vanKey || undefined,
                            providerCatId: terminalResult.catId || undefined,
                            providerRawResponse: JSON.stringify(terminalResult.rawResponse || {}),
                        })
                    );
                    summary.issuedCount += 1;
                    continue;
                }

                await paymentService.updateCashReceiptResult(
                    task.cashReceiptId,
                    buildUpdatePayload(task, "failed", {
                        approvalNo: terminalResult.authNo || undefined,
                        approvalDate: terminalResult.replyDate || undefined,
                        providerTradeType: "CC",
                        providerAddInfo: terminalResult.addInfo || undefined,
                        providerTradeKey: terminalResult.vanKey || undefined,
                        providerCatId: terminalResult.catId || undefined,
                        providerRawResponse: JSON.stringify(terminalResult.rawResponse || {}),
                        errorMessage: terminalResult.displayMsg || `응답코드 ${terminalResult.replyCode}`,
                    })
                );
                summary.failedCount += 1;
                summary.messages.push(`${formatTaskLabel(task)}: ${terminalResult.displayMsg || `응답코드 ${terminalResult.replyCode}`}`);
                continue;
            }

            if (transactionType === "CANCEL") {
                if (!task.originalApprovalNo || !task.originalApprovalDate) {
                    await paymentService.updateCashReceiptResult(
                        task.cashReceiptId,
                        buildUpdatePayload(task, "needs_manual_action", {
                            errorMessage: "원 현금영수증 승인정보가 부족합니다.",
                        })
                    );
                    summary.manualActionCount += 1;
                    summary.messages.push(`${formatTaskLabel(task)}: 원 승인정보가 없어 수기 확인 상태로 남겼습니다.`);
                    continue;
                }

                const terminalResult = await kisTerminalService.requestCashReceiptCancel({
                    amount: task.amount,
                    purpose: toPurpose(task),
                    orgAuthDate: task.originalApprovalDate,
                    orgAuthNo: task.originalApprovalNo,
                    cancelReasonCode: task.cancelReasonCode,
                    addInfo: task.providerAddInfo || task.providerTradeKey,
                    merchantTel: options?.merchantTel,
                });

                if (terminalResult.success) {
                    await paymentService.updateCashReceiptResult(
                        task.cashReceiptId,
                        buildUpdatePayload(task, "cancelled", {
                            approvalNo: terminalResult.authNo,
                            approvalDate: terminalResult.replyDate,
                            providerTradeType: "CR",
                            providerAddInfo: terminalResult.addInfo || undefined,
                            providerTradeKey: terminalResult.vanKey || undefined,
                            providerCatId: terminalResult.catId || undefined,
                            providerRawResponse: JSON.stringify(terminalResult.rawResponse || {}),
                        })
                    );
                    summary.cancelledCount += 1;
                    continue;
                }

                await paymentService.updateCashReceiptResult(
                    task.cashReceiptId,
                    buildUpdatePayload(task, "cancel_failed", {
                        approvalNo: terminalResult.authNo || undefined,
                        approvalDate: terminalResult.replyDate || undefined,
                        providerTradeType: "CR",
                        providerAddInfo: terminalResult.addInfo || undefined,
                        providerTradeKey: terminalResult.vanKey || undefined,
                        providerCatId: terminalResult.catId || undefined,
                        providerRawResponse: JSON.stringify(terminalResult.rawResponse || {}),
                        errorMessage: terminalResult.displayMsg || `응답코드 ${terminalResult.replyCode}`,
                    })
                );
                summary.failedCount += 1;
                summary.messages.push(`${formatTaskLabel(task)}: ${terminalResult.displayMsg || `응답코드 ${terminalResult.replyCode}`}`);
                continue;
            }

            summary.skippedCount += 1;
        } catch (error: any) {
            const errorMessage = String(error?.message || "현금영수증 단말 처리 중 오류");
            const nextStatus: UpdateCashReceiptResultRequest["status"] = isAmbiguousTerminalError(errorMessage)
                ? "unknown"
                : "needs_manual_action";

            await paymentService.updateCashReceiptResult(
                task.cashReceiptId,
                buildUpdatePayload(task, nextStatus, {
                    errorMessage,
                })
            );

            if (nextStatus === "unknown") {
                summary.unknownCount += 1;
            } else {
                summary.manualActionCount += 1;
            }
            summary.messages.push(`${formatTaskLabel(task)}: ${errorMessage}`);
        }
    }

    return summary;
}
