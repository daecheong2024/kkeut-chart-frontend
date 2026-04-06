import logo from "../assets/logo.svg";

export function BrandMark({ size = 150 }: { size?: number }) {
  return (
    <div className="flex items-center justify-center py-2">
      <img src={logo} alt="KKEUT Chart" className="object-contain" style={{ width: size, height: "auto" }} />
    </div>
  );
}
