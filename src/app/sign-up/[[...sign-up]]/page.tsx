import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="auth-container animate-fade-in">
      <div className="glass-panel" style={{ padding: '2rem', display: 'inline-block' }}>
        <SignUp />
      </div>
    </div>
  );
}
