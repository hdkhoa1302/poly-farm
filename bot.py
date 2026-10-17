#!/usr/bin/env python3
"""Bot Telegram hoàn chỉnh cho Poly Farm Hub.
Chạy: python3 bot.py
Yêu cầu: pip install python-telegram-bot
"""
import os
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, ContextTypes

BOT_TOKEN = os.getenv("BOT_TOKEN", "YOUR_BOT_TOKEN")
HUB_URL = "https://hdkhoa1302.github.io/poly-farm/"
APPS = [
    {"name": "Poly Farm", "icon": "🌾", "short": "polyfarm",
     "url": "https://hdkhoa1302.github.io/poly-farm/poly-farm/"},
]

async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    kb = [[InlineKeyboardButton("🎮 Mở Hub", web_app=WebAppInfo(url=HUB_URL))]]
    for app in APPS:
        kb.append([InlineKeyboardButton(f"{app['icon']} {app['name']}", web_app=WebAppInfo(url=app['url']))])
    await update.message.reply_text(
        "🎮 App Hub — Chọn ứng dụng để chơi:",
        reply_markup=InlineKeyboardMarkup(kb)
    )

async def play(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    kb = [[InlineKeyboardButton(f"{a['icon']} {a['name']}", web_app=WebAppInfo(url=a['url'])) for a in APPS]]
    await update.message.reply_text("Chọn game:", reply_markup=InlineKeyboardMarkup(kb))

def main():
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("play", play))
    app.run_polling()

if __name__ == "__main__":
    main()
EOF