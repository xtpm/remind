type DiscordEmbed = {
  title: string;
  description: string;
  footer?: { text: string };
};

export async function sendDiscordEmbed(webhook: string, embed: DiscordEmbed) {
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "kuudere reminders",
      content: "",
      embeds: [
        {
          title: embed.title,
          description: embed.description,
          color: 16743094,
          footer: embed.footer,
          timestamp: new Date().toISOString(),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Discord webhook failed with ${response.status}`);
  }
}
