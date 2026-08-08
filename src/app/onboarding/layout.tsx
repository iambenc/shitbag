import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { StepProgress } from "@/components/onboarding/StepProgress";

export default async function OnboardingLayout({ children }: LayoutProps<"/onboarding">) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div>
      <StepProgress />
      <div className="mx-auto max-w-2xl px-6 py-10">{children}</div>
    </div>
  );
}
