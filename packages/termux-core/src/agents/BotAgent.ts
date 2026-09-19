import { mkdir, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { BaseAgent, type AgentContext } from "./BaseAgent"

function safeName(input: string): string {
  const value = input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  return value.slice(0, 48) || "nexus-bot"
}

const ECHO_MAIN =
  "import os\nfrom telegram import Update\nfrom telegram.ext import Application, MessageHandler, ContextTypes, filters\n\nasync def echo(update: Update, context: ContextTypes.DEFAULT_TYPE):\n    if update.message:\n        await update.message.reply_text(update.message.text or \"\")\n\ndef main():\n    token = os.environ[\"TELEGRAM_BOT_TOKEN\"]\n    app = Application.builder().token(token).build()\n    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, echo))\n    app.run_polling()\n\nif __name__ == \"__main__\":\n    main()\n"

const REMINDER_MAIN =
  "import asyncio, os\nfrom datetime import datetime\nfrom telegram import Update\nfrom telegram.ext import Application, CommandHandler, ContextTypes\n\nREMINDERS = {}\n\nasync def set_reminder(update: Update, context: ContextTypes.DEFAULT_TYPE):\n    if not update.message or not context.args:\n        await update.message.reply_text(\"Usage: /remind HH:MM message\")\n        return\n    when = context.args[0]\n    message = \" \".join(context.args[1:]) or \"Your reminder\"\n    REMINDERS.setdefault(when, []).append((update.message.chat_id, message))\n    await update.message.reply_text(f\"Reminder set for {when}: {message}\")\n\nasync def tick(app):\n    while True:\n        now = datetime.now().strftime(\"%H:%M\")\n        for chat_id, message in REMINDERS.pop(now, []):\n            await app.bot.send_message(chat_id, f\"Reminder: {message}\")\n        await asyncio.sleep(30)\n\ndef main():\n    app = Application.builder().token(os.environ[\"TELEGRAM_BOT_TOKEN\"]).build()\n    app.add_handler(CommandHandler(\"remind\", set_reminder))\n    app.add_handler(CommandHandler(\"reminder\", set_reminder))\n    asyncio.get_event_loop().create_task(tick(app))\n    app.run_polling()\n\nif __name__ == \"__main__\":\n    main()\n"

const POLL_MAIN =
  "import os\nfrom telegram import Update\nfrom telegram.ext import Application, CommandHandler, ContextTypes\n\nasync def poll(update: Update, context: ContextTypes.DEFAULT_TYPE):\n    if not update.message or not context.args:\n        await update.message.reply_text('Usage: /poll \"Question\" \"Option 1\" \"Option 2\" ...')\n        return\n    parts = [part.strip() for part in \" \".join(context.args).split('\"') if part.strip()]\n    if len(parts) < 2:\n        await update.message.reply_text('Need a question and at least one option.')\n        return\n    question, options = parts[0], parts[1:]\n    await update.message.reply_poll(question, options, is_anonymous=False, allows_multiple_answers=len(options) > 2)\n\ndef main():\n    app = Application.builder().token(os.environ[\"TELEGRAM_BOT_TOKEN\"]).build()\n    app.add_handler(CommandHandler(\"poll\", poll))\n    app.run_polling()\n\nif __name__ == \"__main__\":\n    main()\n"

const QUOTE_MAIN =
  "import os, random\nfrom telegram import Update\nfrom telegram.ext import Application, CommandHandler, ContextTypes\n\nQUOTES = [\n    \"Simplicity is the soul of efficiency.\",\n    \"First, solve the problem. Then, write the code.\",\n    \"Code is read far more often than it is written.\",\n    \"Make it work, make it right, make it fast.\",\n    \"Fix the cause, not the symptom.\",\n]\n\nasync def quote(update: Update, context: ContextTypes.DEFAULT_TYPE):\n    if update.message:\n        await update.message.reply_text(random.choice(QUOTES))\n\ndef main():\n    app = Application.builder().token(os.environ[\"TELEGRAM_BOT_TOKEN\"]).build()\n    app.add_handler(CommandHandler(\"quote\", quote))\n    app.run_polling()\n\nif __name__ == \"__main__\":\n    main()\n"

const WELCOME_MAIN =
  "import os\nfrom telegram import Update\nfrom telegram.ext import Application, MessageHandler, ContextTypes, filters\n\nasync def welcome(update: Update, context: ContextTypes.DEFAULT_TYPE):\n    for member in update.message.new_chat_members or []:\n        await update.message.reply_text(f\"Welcome to the group, {member.first_name or 'friend'}!\")\n\ndef main():\n    app = Application.builder().token(os.environ[\"TELEGRAM_BOT_TOKEN\"]).build()\n    app.add_handler(MessageHandler(filters.StatusUpdate.NEW_CHAT_MEMBERS, welcome))\n    app.run_polling()\n\nif __name__ == \"__main__\":\n    main()\n"

type BotTemplate = { name: string; main: string }

function pickTemplate(task: string): BotTemplate {
  const lower = task.toLowerCase()
  if (/\b(remind|reminder|alarm|timer|notice)\b/.test(lower)) {
    return { name: safeName(task) || "reminder-bot", main: REMINDER_MAIN }
  }
  if (/\b(poll|vote|choose|quiz)\b/.test(lower)) {
    return { name: safeName(task) || "poll-bot", main: POLL_MAIN }
  }
  if (/\b(quote|motivat|inspire)\b/.test(lower)) {
    return { name: safeName(task) || "quote-bot", main: QUOTE_MAIN }
  }
  if (/\b(welcome|onboard|greet|join)\b/.test(lower)) {
    return { name: safeName(task) || "welcome-bot", main: WELCOME_MAIN }
  }
  return { name: "echo-bot", main: ECHO_MAIN }
}

export class BotAgent extends BaseAgent {
  readonly name = "bot-agent"
  readonly systemPrompt = "Prepare a lightweight Python Telegram bot using the hired Telegram worker."

  async execute(task: string, context: AgentContext) {
    const template = pickTemplate(task)
    const outputDir = context.outputDir ?? join(homedir(), ".nexus", "bots", template.name)
    await mkdir(outputDir, { recursive: true })
    const run = "#!/data/data/com.termux/files/usr/bin/sh\nset -eu\nexec python main.py\n"
    const install = "#!/data/data/com.termux/files/usr/bin/sh\nset -eu\npython -m pip install --user --no-cache-dir python-telegram-bot\n"
    await writeFile(join(outputDir, "main.py"), template.main, "utf8")
    await writeFile(join(outputDir, "run.sh"), run, { encoding: "utf8", mode: 0o755 })
    await writeFile(join(outputDir, "install.sh"), install, { encoding: "utf8", mode: 0o755 })
    return { outputDir, name: template.name, files: ["main.py", "run.sh", "install.sh"] }
  }
}