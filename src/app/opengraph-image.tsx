import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Dev Health — Engineering Effort Analytics";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  const logoData = await readFile(
    join(process.cwd(), "src/assets/fc-logo.png"),
  );
  const logoBase64 = `data:image/png;base64,${logoData.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#1c1b1f",
          backgroundImage:
            "radial-gradient(ellipse at 50% 40%, rgba(208,188,255,0.08) 0%, transparent 60%)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori requires <img>, not next/image */}
        <img
          src={logoBase64}
          alt=""
          width={200}
          height={200}
          style={{ marginBottom: 32 }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span
            style={{
              fontSize: 48,
              fontWeight: 700,
              color: "#e6e1e5",
              letterSpacing: "-0.02em",
            }}
          >
            Dev Health
          </span>
          <span
            style={{
              fontSize: 22,
              color: "#cac4d0",
              letterSpacing: "0.05em",
            }}
          >
            Engineering Effort Analytics
          </span>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 4,
            background:
              "linear-gradient(90deg, #d0bcff 0%, #efb8c8 50%, #ffcc80 100%)",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
