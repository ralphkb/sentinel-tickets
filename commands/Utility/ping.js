const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const { client } = require("../../init.js");
const { configEmbed } = require("../../utils/mainUtils.js");

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
    const isEphemeral =
      config.pingEmbed.ephemeral !== undefined
        ? config.pingEmbed.ephemeral
        : false;
    await interaction.deferReply({
      flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
    });
    const startTime = performance.now();

    const defaultDMValues = {
      color: "#2FF200",
      title: "Ping & Latency",
      timestamp: true,
      footer: {
        text: `Requested by ${interaction.user.username}`,
        iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
      },
    };

    const pingEmbed = await configEmbed("pingEmbed", defaultDMValues);

    try {
      const wsPing = await interaction.client.ws.ping;
      const endTime = performance.now();
      const latency = Math.round((endTime - startTime) * 1000);

      pingEmbed.addFields([
        {
          name: "Websocket Ping",
          value: `${wsPing}ms`,
          inline: true,
        },
        {
          name: "Latency",
          value: `${latency}ms`,
          inline: true,
        },
      ]);

      await interaction.editReply({
        embeds: [pingEmbed],
        flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
      });
    } catch (error) {
      error.errorContext = `[Ping Command Error]: there was an error while executing the ping command.`;
      client.emit("error", error);
    }
  },
};
