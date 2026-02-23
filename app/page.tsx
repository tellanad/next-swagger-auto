export default function HomePage() {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>Next Swagger Auto</h1>
      <p>
        This project generates OpenAPI docs from runtime Zod schemas and serves
        Swagger UI at <a href="/docs">/docs</a>.
      </p>
      <p>
        Try the sample endpoint: <code>POST /api/chat</code>
      </p>
    </main>
  );
}
