const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const { mainDB } = require("../../index.js");
const packageJson = require("../../package.json");
const { configEmbed } = require("../../index.js");

module.exports = {
  enabled: config.commands.stats.enabled,
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Shows some useful stats.")
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.stats.permission],
    )
    .setDMPermission(false),
  async execute(interaction) {
    await interaction.deferReply();
    const totalTickets = (await mainDB.get("totalTickets")) ?? 0;
    const openTickets = (await mainDB.get("openTickets")) ?? [];
    const totalClaims = (await mainDB.get("totalClaims")) ?? 0;
    const totalReviews = (await mainDB.get("totalReviews")) ?? 0;
    const ratingsArray = (await mainDB.get("ratings")) ?? [];
    const averageRating =
      ratingsArray.reduce((total, current) => total + current, 0) /
      ratingsArray.length;
    const totalOpenTickets = openTickets.length;
    const ramUsage = process.memoryUsage().heapUsed;
    const ramUsageMB = (ramUsage / 1024 / 1024).toFixed(2);

    const defaultDMValues = {
      color: "#2FF200",
      title: "📊 Statistics",
      thumbnail: interaction.guild.iconURL(),
      timestamp: true,
      footer: {
        text: `Requested by ${interaction.user.username}`,
        iconURL: `${interaction.user.displayAvatarURL({ format: "png", dynamic: true, size: 1024 })}`,
      },
    };

    const statsEmbed = await configEmbed("statsEmbed", defaultDMValues);

    statsEmbed.addFields([
      {
        name: "🎫 Tickets",
        value: `> Total Tickets: ${totalTickets}\n> Total Open Tickets: ${totalOpenTickets}\n> Total Claimed Tickets: ${totalClaims}`,
      },
      {
        name: "⭐ Reviews",
        value: `> Total Reviews: ${totalReviews}\n> Average Rating: ${ratingsArray.length ? averageRating.toFixed(1) : 0}/5.0`,
      },
      {
        name: "🤖 Bot",
        value: `> Version: v${packageJson.version}\n> RAM Usage: ${ramUsageMB} MB`,
      },
    ]);

    await interaction.editReply({ embeds: [statsEmbed] });
  },
};
