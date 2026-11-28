"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { NATIVE_AUTH_REDIRECT } from "@/lib/account";
import { completeNativeSignIn, refreshAccount, startAccount } from "@/lib/account-store";
import { notePlainNavigation } from "@/components/layout/SharedLink";
import { onNativeAuthRedirect } from "@/lib/native";

/**
 * La cuenta en toda la app (Tarea 8.5): al abrir, si hay sesión, la sincroniza; al volver a la app tras un rato, otra vez;
 * y en Android recoge la vuelta de "Entrar con Google" (`com.hoopmeter.app://auth?code=…`) y abre `/cuenta`.
 * Sin sesión guardada no descarga nada.
 */
export function AccountSync() {
  const router = useRouter();

  useEffect(() => {
    startAccount();
    const onVisible = () => document.visibilityState === "visible" && refreshAccount();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(
    () =>
      onNativeAuthRedirect(NATIVE_AUTH_REDIRECT, (url) => {
        void completeNativeSignIn(url).then((handled) => {
          if (!handled || window.location.pathname === "/cuenta") return;
          notePlainNavigation("/cuenta");
          router.push("/cuenta");
        });
      }),
    [router]
  );

  return null;
}
