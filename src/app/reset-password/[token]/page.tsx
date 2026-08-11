import { ResetPasswordForm } from "./ResetPasswordForm";

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-6 py-16">
      <div>
        <h1 className="font-display text-3xl font-semibold text-(--brand-primary)">Choose a new password</h1>
      </div>
      <ResetPasswordForm token={token} />
    </div>
  );
}
