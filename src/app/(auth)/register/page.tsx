import { AuthForm } from "@/components/auth/auth-form";
import { registerAction } from "@/lib/auth/actions";

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <AuthForm mode="register" action={registerAction} />
    </div>
  );
}
