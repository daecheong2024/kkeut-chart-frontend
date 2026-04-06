import apiClient from "./apiClient";

export interface MyProfile {
  id: string;
  name: string;
  email: string;
  branchId: string;
}

function normalizeProfile(raw: any): MyProfile {
  return {
    id: String(raw?.id ?? ""),
    name: String(raw?.name ?? ""),
    email: String(raw?.email ?? ""),
    branchId: String(raw?.branchId ?? "")
  };
}

export const userProfileService = {
  async getMyProfile(): Promise<MyProfile> {
    const response = await apiClient.get("/users/me");
    return normalizeProfile(response.data);
  },

  async updateMyProfile(data: { name: string }): Promise<MyProfile> {
    const response = await apiClient.put("/users/me", data);
    return normalizeProfile(response.data);
  },

  async changeMyPassword(currentPassword: string, newPassword: string): Promise<void> {
    await apiClient.put("/users/me/password", { currentPassword, newPassword });
  }
};

