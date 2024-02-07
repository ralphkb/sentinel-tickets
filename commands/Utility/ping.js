const {
  EmbedBuilder,
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);

module.exports = {
  enabled: config.commands.ping.enabled,
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Execute the ping command.")
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.ping.permission],
    )
    .setDMPermission(false),
  async execute(interaction) {
    const ping = new EmbedBuilder()
      .setTitle("Ping & Latency")
      .setColor(config.default_embed_color)
      .addFields([
        {
          name: "Ping",
          value: interaction.client.ws.ping + "ms",
          inline: true,
        },
        {
          name: "Latency",
          value: `${performance.now() - interaction.createdTimestamp}ms`,
          inline: true,
        },
      ])
      .setTimestamp()
      .setFooter({
        text: `Requested by: ${interaction.user.username}`,
        iconURL: `${interaction.user.displayAvatarURL({ dynamic: true })}`,
      });
    interaction.reply({ embeds: [ping] });
  },
};
