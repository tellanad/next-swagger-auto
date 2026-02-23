import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Next Swagger Auto",
  description: "FastAPI-style docs for a Next.js app"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
