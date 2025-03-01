import { Button } from "#/ui/Button";
import { signIn } from "auth-astro/client";

export function Login() {
  return (
    <main className="flex flex-col items-center border-2 dark:border-zinc-300 rounded p-8 dark:bg-zinc-800">
      <h1 className="text-4xl pb-6">Sign In</h1>
      <div className="w-60 flex flex-col">
        <Button className="bg-[#9146FF] rounded-none"
        onPress={() => signIn("twitch")}>Login With Twitch</Button>
      </div>
    </main>
  )
}