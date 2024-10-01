const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const packageJson = require("../../package.json");
const { mainDB } = require("../../init.js");
const {
  configEmbed,
  formatTime,
  sanitizeInput,
} = require("../../utils/mainUtils.js");

module.exports = {
  enabled: config.commands.stats.enabled,
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Adjust or list useful stats.")
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List useful stats."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription("Adjust some of the statistics.")
        .addStringOption((option) =>
          option
            .setName("statistic")
            .setDescription("Select the statistic to be adjusted")
            .setRequired(true)
            .addChoices(
              { name: "Total Tickets", value: "totalTickets" },
              { name: "Total Claims", value: "totalClaims" },
              { name: "Total Messages", value: "totalMessages" },
            ),
        )
        .addIntegerOption((option) =>
          option
            .setName("value")
            .setDescription("The new value of the statistic")
            .setMinValue(0)
            .setRequired(true),
        ),
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.stats.permission],
    )
    .setDMPermission(false),
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "list") {
      const isEphemeral =
        config.statsEmbed.ephemeral !== undefined
          ? config.statsEmbed.ephemeral
          : false;
      await interaction.deferReply({ ephemeral: isEphemeral });
      const totalTickets = (await mainDB.get("totalTickets")) ?? 0;
      const openTickets = (await mainDB.get("openTickets")) ?? 0;
      const totalClaims = (await mainDB.get("totalClaims")) ?? 0;
      const totalReviews = (await mainDB.get("totalReviews")) ?? 0;
      const ratingsArray = (await mainDB.get("ratings")) ?? [];
      const totalMessages = (await mainDB.get("totalMessages")) ?? 0;
      const ticketCreators = (await mainDB.get("ticketCreators")) ?? [];
      const averageRating =
        ratingsArray.reduce((total, current) => total + current, 0) /
        ratingsArray.length;
      const ramUsage = process.memoryUsage().heapUsed;
      const ramUsageMB = (ramUsage / 1024 / 1024).toFixed(2);
      const totalTicketCreators = ticketCreators.length;
      const averageTicketsCreated =
        ticketCreators.reduce(
          (total, creator) => total + creator.ticketsCreated,
          0,
        ) / totalTicketCreators;
      const totalUptime = Math.floor(process.uptime());

      const defaultValues = {
        color: "#2FF200",
        title: "📊 Statistics",
        thumbnail: interaction.guild.iconURL({
          extension: "png",
          dynamic: true,
          size: 1024,
        }),
        timestamp: true,
        footer: {
          text: `Requested by ${interaction.user.username}`,
          iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
        },
      };

      const statsEmbed = await configEmbed("statsEmbed", defaultValues);

      statsEmbed.addFields([
        {
          name: "🎫 Tickets",
          value: `> Total Tickets: ${totalTickets}\n> Total Open Tickets: ${openTickets}\n> Total Claimed Tickets: ${totalClaims}\n> Total Messages: ${totalMessages}\n> Total Ticket Creators: ${totalTicketCreators}\n> Average Tickets Created Per User: ${ticketCreators.length ? averageTicketsCreated.toFixed(0) : 0}`,
        },
        {
          name: "⭐ Reviews",
          value: `> Total Reviews: ${totalReviews}\n> Average Rating: ${ratingsArray.length ? averageRating.toFixed(1) : 0}/5.0`,
        },
        {
          name: "🤖 Bot",
          value: `> Version: v${packageJson.version}\n> RAM Usage: ${ramUsageMB} MB\n> Uptime: ${formatTime(totalUptime)}`,
        },
      ]);

      await interaction.editReply({
        embeds: [statsEmbed],
        ephemeral: isEphemeral,
      });
    } else if (subcommand === "set") {
      if (
        config.commands.stats.support_role_ids.length === 0 ||
        !interaction.member.roles.cache.some((role) =>
          config.commands.stats.support_role_ids.includes(role.id),
        )
      ) {
        return interaction.reply({
          content:
            config.errors.not_allowed || "You are not allowed to use this!",
          ephemeral: true,
        });
      }
      const isEphemeral =
        config.statsSetEmbed.ephemeral !== undefined
          ? config.statsSetEmbed.ephemeral
          : true;
      const statistic = interaction.options.getString("statistic");
      const value = interaction.options.getInteger("value");
      await interaction.deferReply({ ephemeral: isEphemeral });
      const defaultValues = {
        color: "#2FF200",
        title: "📊 Statistics Modification",
        description:
          "The statistic **{stat}** has been set to **{value}** by **{user}** ({user.tag})",
        timestamp: true,
        footer: {
          text: `Executed by ${interaction.user.username}`,
          iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
        },
      };

      const statsSetEmbed = await configEmbed("statsSetEmbed", defaultValues);
      if (statsSetEmbed.data && statsSetEmbed.data.description) {
        statsSetEmbed.setDescription(
          statsSetEmbed.data.description
            .replace(/\{stat\}/g, statistic)
            .replace(/\{value\}/g, value)
            .replace(/\{user\}/g, interaction.user)
            .replace(/\{user\.tag\}/g, sanitizeInput(interaction.user.tag)),
        );
      }

      await mainDB.set(statistic, value);
      await interaction.editReply({
        embeds: [statsSetEmbed],
        ephemeral: isEphemeral,
      });
    }
  },
};
