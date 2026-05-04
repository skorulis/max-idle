import { APP_VERSION } from "@maxidle/shared/appVersion";

export function HelpPage() {
  return (
    <section className="card">
      <h2>Help</h2>
      <div className="panel">
        <h3>What is Max Idle?</h3>
        <p>
          Max Idle is a game about doing as little as possible while your idle time grows. Compete against other players to find who is the most patient.
          <br/>
          It's a joke about the competitive idle game genre where the only way to win is to wait until you've been playing longer than the next person.
        </p>
      </div>
      <div className="panel" style={{ marginTop: "0.75rem" }}>
        <h3>Support and Suggestions</h3>
        <p>
          Need help, found a bug, or have an idea to improve the game? Email us at{" "}
          <a href="mailto:support@max-idle.com">support@max-idle.com</a> or join the <a href="https://discordapp.com/channels/1500691745850134532/1500691747133587539">Discord</a>.
        </p>
      </div>
      <p style={{ marginTop: "1.25rem", fontSize: "0.85rem", color: "#6b7280" }}>
        Client version {APP_VERSION}
      </p>
    </section>
  );
}
