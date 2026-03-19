"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      router.push("/dashboard");
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="border-slate-200/60 bg-white/80 shadow-lg backdrop-blur-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">
            登入
          </CardTitle>
          <CardDescription className="text-slate-600">
            請輸入您的電子郵件與密碼
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email" className="text-slate-700 font-medium">
                  電子郵件
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border-slate-200 focus-visible:ring-emerald-500"
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password" className="text-slate-700 font-medium">
                    密碼
                  </Label>
                  <Link
                    href="/auth/forgot-password"
                    className="ml-auto inline-block text-sm text-emerald-600 underline-offset-4 hover:underline"
                  >
                    忘記密碼？
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border-slate-200 focus-visible:ring-emerald-500"
                />
              </div>
              {error && (
                <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                className="w-full rounded-full bg-emerald-600 text-white hover:bg-emerald-500 border-0 h-12 text-base font-semibold shadow-lg shadow-emerald-600/20 transition-all hover:scale-[1.02]"
                disabled={isLoading}
              >
                {isLoading ? "登入中..." : "登入"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
