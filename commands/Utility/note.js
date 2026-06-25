const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const { getNotes, addNote, removeNote } = require("../../utils/userNotes.js");
const { getUser, sanitizeInput } = require("../../utils/mainUtils.js");

module.exports = {
  enabled: config.commands.note.enabled,
  data: new SlashCommandBuilder()
    .setName("note")
    .setDescription("Manage staff notes for a user.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add a note to a user.")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("Select a user")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("note")
            .setDescription("The note to add")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("view")
        .setDescription("View all notes for a user.")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("Select a user")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove a note from a user.")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("Select a user")
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("index")
            .setDescription(
              "The number of the note to remove (from /note view)",
            )
            .setRequired(true)
            .setMinValue(1),
        ),
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.note.permission],
    )
    .setDMPermission(false),
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const targetUser = interaction.options.getUser("user");

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (subcommand === "add") {
      const text = interaction.options.getString("note");
      await addNote(targetUser.id, text, interaction.user.id);
      return interaction.editReply({
        content: `Note added for **${sanitizeInput(targetUser.username)}**.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "view") {
      const notes = await getNotes(targetUser.id);
      if (notes.length === 0) {
        return interaction.editReply({
          content: `No notes found for **${sanitizeInput(targetUser.username)}**.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      const noteLines = await Promise.all(
        notes.map(async (note, i) => {
          const staffUser = await getUser(note.addedBy);
          const staffTag = staffUser
            ? sanitizeInput(staffUser.username)
            : "Unknown";
          const timestamp = `<t:${Math.floor(note.addedAt / 1000)}:R>`;
          return `**${i + 1}.** ${note.text}\n> Added by **${staffTag}** ${timestamp}`;
        }),
      );

      const notesEmbed = new EmbedBuilder()
        .setColor("#2FF200")
        .setTitle(`Staff Notes — ${sanitizeInput(targetUser.username)}`)
        .setDescription(noteLines.join("\n\n"))
        .setThumbnail(
          targetUser.displayAvatarURL({ extension: "png", size: 1024 }),
        )
        .setTimestamp()
        .setFooter({
          text: `${notes.length} note${notes.length !== 1 ? "s" : ""} • Requested by ${interaction.user.tag}`,
          iconURL: interaction.user.displayAvatarURL({
            extension: "png",
            size: 1024,
          }),
        });

      return interaction.editReply({
        embeds: [notesEmbed],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "remove") {
      const index = interaction.options.getInteger("index");
      const { removed } = await removeNote(targetUser.id, index);
      if (!removed) {
        return interaction.editReply({
          content: `Note **#${index}** does not exist for **${sanitizeInput(targetUser.username)}**. Use \`/note view\` to see valid note numbers.`,
          flags: MessageFlags.Ephemeral,
        });
      }
      return interaction.editReply({
        content: `Note **#${index}** removed for **${sanitizeInput(targetUser.username)}**.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
