import apiClient from "./apiClient";

export interface NoticeItem {
  id: number;
  type: string;
  title: string;
  content: string;
  isImportant: boolean;
  createdAt: string;
  creatorName: string;
  modifiedAt: string;
  modifierName: string;
}

export const noticeService = {
  async getNotices(branchId: string): Promise<NoticeItem[]> {
    const response = await apiClient.get(`/notices`, {
      params: { branchId }
    });
    const data = response.data;
    return Array.isArray(data) ? data : data?.items ?? [];
  },

  async getHqNotices(): Promise<NoticeItem[]> {
    const response = await apiClient.get(`/notices/hq`);
    const data = response.data;
    return Array.isArray(data) ? data : data?.items ?? [];
  },

  async createNotice(
    branchId: string,
    title: string,
    content: string,
    type: string = "일반",
    isImportant: boolean = false,
    actor?: string
  ): Promise<NoticeItem> {
    const response = await apiClient.post("/notices", {
      branchId,
      title,
      content,
      type,
      isImportant,
      actor
    });
    return response.data;
  },

  async updateNotice(
    id: number,
    payload: {
      title?: string;
      content?: string;
      type?: string;
      isImportant?: boolean;
      actor?: string;
    }
  ): Promise<NoticeItem> {
    const response = await apiClient.put(`/notices/${id}`, payload);
    return response.data;
  },

  async deleteNotice(id: number): Promise<void> {
    await apiClient.delete(`/notices/${id}`);
  },
};
