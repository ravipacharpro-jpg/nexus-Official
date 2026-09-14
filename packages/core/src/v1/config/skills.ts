export * as ConfigSkillsV1 from "./skills"

import { Schema } from "effect"

export const Info = Schema.Struct({
  paths: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "Additional paths to skill folders",
  }),
  urls: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "URLs to fetch skills from (e.g., https://example.com/.well-known/skills/)",
  }),
  maxPromptChars: Schema.optional(Schema.Number).annotate({
    description: "Prompt budget for skill listings; longer lists render compact without descriptions",
  }),
})
export type Info = Schema.Schema.Type<typeof Info>
