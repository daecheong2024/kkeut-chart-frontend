import logo from "../assets/logo.png";

export function BrandMark({ size = 150 }: { size?: number }) {
  return (
    <div className="flex items-center justify-center py-2">
      <img
        src={logo}
        alt="끗 한의원"
        className="object-contain drop-shadow-[0_4px_14px_rgba(226,107,124,0.25)]"
        style={{ width: size, height: "auto" }}
      />
    </div>
  );
}
