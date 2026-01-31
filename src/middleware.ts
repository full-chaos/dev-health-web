import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

const publicPaths = [
  "/auth/signin",
  "/auth/error",
  "/api/auth",
]

function isPublicPath(pathname: string): boolean {
  return publicPaths.some(path => pathname.startsWith(path))
}

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isAuthenticated = !!req.auth

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  if (!isAuthenticated) {
    const signInUrl = new URL("/auth/signin", req.url)
    signInUrl.searchParams.set("callbackUrl", req.url)
    return NextResponse.redirect(signInUrl)
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
