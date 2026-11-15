import { redirect } from "next/navigation";

// Temporary: feature 5 replaces this with the Overview page.
export default function Home() {
  redirect("/status");
}
