const { MessageFlags } = require("discord.js");




const { mainDB, client } = require("../init.js");
const {
  configEmbed,
  sanitizeInput,
  logMessage,
  getChannel,
} = require("./mainUtils.js");

async function getFeedback(interaction, i, withModal = true) {
  const message = await interaction.user.dmChannel.messages.fetch(
    interaction.message.id,
  );
  await message.edit({ components: [] });
  const currentFooter = message.embeds[0].footer.text;
  const defaultValues = {
    color: "#2FF200",
    title: "Ticket Logs | Ticket Feedback",
    timestamp: true,
    thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
    footer: {
      text: `${interaction.user.tag}`,
      iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
    },
  };

  const logRatingEmbed = await configEmbed("logRatingEmbed", defaultValues);

  logRatingEmbed.addFields({
    name: config.logRatingEmbed.field_creator || "• Ticket Creator",
    value: `> <@!${interaction.user.id}>\n> ${sanitizeInput(interaction.user.tag)}`,
  });

  logRatingEmbed.addFields({
    name: config.logRatingEmbed.field_ticket || "• Ticket",
    value: `> ${sanitizeInput(currentFooter)}`,
  });

  if (withModal) {
    const questions = config.DMUserSettings.ratingSystem.questions;
    for (
      let questionIndex = 0;
      questionIndex < questions.length;
      questionIndex++
    ) {
      const question = questions[questionIndex];
      const { label } = question;
      const value = interaction.fields.getTextInputValue(
        `ratingQuestion${questionIndex + 1}`,
      );

      logRatingEmbed.addFields({
        name: `• ${label}`,
        value: `>>> ${value}`,
      });
    }
  }

  logRatingEmbed.addFields({
    name: config.logRatingEmbed.field_rating || "• Ticket Rating",
    value: `${"⭐".repeat(i)} **(${i}/5)**`,
  });

  let logChannelId = config.logs.ticketFeedback || config.logs.default;
  let logChannel = await getChannel(logChannelId);
  if (config.toggleLogs.ticketFeedback) {
    try {
      await logChannel.send({ embeds: [logRatingEmbed] });
    } catch (error) {
      error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
      client.emit("error", error);
    }
  }
  await mainDB.add("totalReviews", 1);
  await mainDB.push("ratings", i);
  await interaction.editReply({
    content: "Your feedback has been sent successfully!",
    flags: MessageFlags.Ephemeral,
  });
  await logMessage(
    `${interaction.user.tag} rated the ticket "${currentFooter}" with ${i} stars`,
  );
}

module.exports = {
  getFeedback,
};
