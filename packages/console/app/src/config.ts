/**
 * Application-wide constants and configuration
 */
export const config = {
  // Base URL
  baseUrl: "https://nexus.ai",

  // GitHub
  github: {
    repoUrl: "https://github.com/ravipacharpro-jpg/nexus-Official",
    starsFormatted: {
      compact: "0",
      full: "0",
    },
  },

  // Social links
  social: {
    twitter: "https://x.com/nexus",
    discord: "https://discord.gg/nexus",
  },

  // Static stats (used on landing page; refreshed from the live GitHub API when available)
  stats: {
    contributors: "2",
    commits: "263",
    monthlyUsers: "0",
  },
} as const
