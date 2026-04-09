import { Lock } from "lucide-react";

interface NoPermissionOverlayProps {
  message?: string;
}

export function NoPermissionOverlay({ message }: NoPermissionOverlayProps) {
  return (
    <div className="flex items-center justify-center h-full min-h-[300px]">
      <div className="text-center py-20">
        <Lock className="w-12 h-12 mx-auto mb-4 text-[#F8DCE2]" />
        <p className="text-sm font-medium text-[#616161]">
          {message || "권한이 없으므로 정보를 표시 할 수 없습니다."}
        </p>
      </div>
    </div>
  );
}
