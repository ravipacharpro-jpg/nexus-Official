const stage = process.env.SST_STAGE || "dev"

export default {
  url: stage === "production" ? "https://nexus.ai" : `https://${stage}.nexus.ai`,
  console: stage === "production" ? "https://nexus.ai/auth" : `https://${stage}.nexus.ai/auth`,
  email: "help@nexus.invalid",
  socialCard: "https://social-cards.sst.dev",
  github: "https://github.com/ravipacharpro-jpg/nexus-Official",
  discord: "https://nexus.ai/discord",
  headerLinks: [
    { name: "app.header.home", url: "/" },
    { name: "app.header.docs", url: "/docs/" },
  ],
}
