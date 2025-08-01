




async function autoResponses(inputString, member) {
  if (config.autoResponses.enabled) {
    const responses = { matches: [] };
    const matchedConditions = new Set();

    for (const trigger of config.autoResponses.triggers) {
      const { condition, response, ignoreMembers, ignoreRoles, requiredRoles } =
        trigger;

      if (
        requiredRoles.length === 0 ||
        member.roles.cache.some((role) => requiredRoles.includes(role.id))
      ) {
        if (
          ignoreRoles.length > 0 &&
          member.roles.cache.some((role) => ignoreRoles.includes(role.id))
        ) {
          continue;
        }
        if (ignoreMembers.includes(member.id)) {
          continue;
        }

        const lowerCaseInput = inputString.toLowerCase();
        const separator = trigger.separator || "`";

        switch (condition) {
          case "startswith":
            if (Array.isArray(trigger.startsWith)) {
              const matchedStartsWith = trigger.startsWith.filter(
                (startsWithString) =>
                  lowerCaseInput.startsWith(startsWithString.toLowerCase()),
              );
              if (
                matchedStartsWith.length > 0 &&
                !matchedConditions.has(condition)
              ) {
                let question = inputString.replace(
                  new RegExp(`^(${matchedStartsWith.join("|")})`, "i"),
                  `${separator}$1${separator}`,
                );
                responses.matches.push({
                  question,
                  answer: response,
                });
                matchedConditions.add(condition);
              }
            }
            break;
          case "endswith":
            if (Array.isArray(trigger.endsWith)) {
              const matchedEndsWith = trigger.endsWith.filter(
                (endsWithString) =>
                  lowerCaseInput.endsWith(endsWithString.toLowerCase()),
              );
              if (
                matchedEndsWith.length > 0 &&
                !matchedConditions.has(condition)
              ) {
                let question = inputString.replace(
                  new RegExp(`(${matchedEndsWith.join("|")})$`, "i"),
                  `${separator}$1${separator}`,
                );
                responses.matches.push({
                  question,
                  answer: response,
                });
                matchedConditions.add(condition);
              }
            }
            break;
          case "exact":
            if (Array.isArray(trigger.exact)) {
              const matchedExact = trigger.exact.filter(
                (exactString) => lowerCaseInput === exactString.toLowerCase(),
              );
              if (
                matchedExact.length > 0 &&
                !matchedConditions.has(condition)
              ) {
                let question = inputString.replace(
                  new RegExp(matchedExact.join("|"), "gi"),
                  `${separator}$&${separator}`,
                );
                responses.matches.push({
                  question,
                  answer: response,
                });
                matchedConditions.add(condition);
              }
            }
            break;
          case "contains":
            if (Array.isArray(trigger.contains)) {
              const matchedContains = trigger.contains.filter(
                (containsString) =>
                  lowerCaseInput.includes(containsString.toLowerCase()),
              );
              if (
                matchedContains.length > 0 &&
                !matchedConditions.has(condition)
              ) {
                let question = inputString;
                for (const containsString of matchedContains) {
                  const regex = new RegExp(containsString, "gi");
                  question = question.replace(
                    regex,
                    `${separator}${containsString}${separator}`,
                  );
                }
                responses.matches.push({
                  question,
                  answer: response,
                });
                matchedConditions.add(condition);
              }
            }
            break;
          case "strict":
            if (Array.isArray(trigger.strict)) {
              const matchedStrict = trigger.strict.filter(
                (strictString) => inputString === strictString,
              );
              if (
                matchedStrict.length > 0 &&
                !matchedConditions.has(condition)
              ) {
                let question = inputString.replace(
                  new RegExp(matchedStrict.join("|"), "g"),
                  `${separator}$&${separator}`,
                );
                responses.matches.push({
                  question,
                  answer: response,
                });
                matchedConditions.add(condition);
              }
            }
            break;
        }
      }
    }

    if (responses.matches.length > 0) {
      return responses;
    } else {
      return null;
    }
  }

  return null;
}

module.exports = {
  autoResponses,
};
