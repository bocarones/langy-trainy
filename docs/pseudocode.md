# Pseudocode Dictionary FR⇄NL – Master Version
# Version: v2.0
# Last refined: 2026-04-30

BEGIN
  INPUT: inputtext (FR)

  // 1. NORMALIZE LEMMA

  IF inputtext IS noun THEN
       use bare singular form
       add gender tag [m] or [f] or [m/f]
       pluralia tantum → keep plural form + gender tag
  ELSE IF inputtext IS verb THEN
       normalize to infinitive
       if pronominal → se + infinitive
  ELSE IF inputtext IS adjective THEN
       normalize to masculine singular
  ELSE IF inputtext IS adverb THEN
       keep as-is
  ELSE IF inputtext IS expression or locution THEN
       reduce to simplest canonical form
  END IF

  // 2. REGISTER LABEL
  IF lemma has register label (fam / vulg / soutenu / lit / jur / rég / belg / ...) THEN
       add label in () after tag → lemma [tag] (fam)
  IF only one sense has a register label THEN
       add label in () after that sense's FR example
  END IF

  // 3. VALIDATE SENSES
  Check Larousse (or equivalent reference dictionary)
  Retain only the most frequently used senses
  Include: literal sense, figurative sense, fixed expressions → all in the same entry
  Separate each sense with **
  Only create a separate entry if the expression has a completely different 
  grammatical nature than the main lemma (e.g. nominal locution under a verb entry)

  // 4. BUILD EXAMPLES
  FOR each sense DO
       prepare 1-2 short natural FR examples
       translate each example into NL
       use __ to avoid repeating the lemma in examples
  END FOR

  // 5. FORMAT OUTPUT

  // Single sense:
  lemma [tag] - ex1_FR - ex2_FR / NL - ex1_NL - ex2_NL

  // Multiple senses:
  lemma [tag] - ex1_FR - ex2_FR ** ex3_FR / (NL_sens1) - ex1_NL - ex2_NL ** (NL_sens2) - ex3_NL

  // Register label at word level:
  morpion [m] (fam) - ...

  // Register label at sense level:
  lemma [tag] - ex1_FR (fam) ** ex2_FR / (NL_sens1) - ex1_NL ** (NL_sens2) - ex2_NL

  // Opposing lemmas:
  lemma1 - ex_FR <> lemma2 - ex_FR / NL1 - ex_NL <> NL2 - ex_NL

  // Single word lookup → wrapped in single backticks:
  `lemma [tag] - ex_FR / NL - ex_NL`

  // 6. SYMBOL RULES
  /    → exactly once per line; separates FR from NL
  **   → separates different senses; must be symmetrical across /
  -    → separates examples within the same sense
  <>   → opposes two lemmas; once per side; symmetrical; never combined with multiple /
  ==   → marks similar words; only on explicit request
  __   → replaces lemma in examples to avoid repetition

  // 7. STYLE CONSTRAINTS
  - No article in lemma; article appears only in examples
  - () around NL translation only if multiple senses
  - No () if single sense
  - Never repeat the lemma in examples when avoidable
  - No empty lines between entries
  - Examples must be short and natural

  // 8. SAMPLE ENTRIES

  // Noun, single sense:
  bibelot [m] - une étagère pleine de __s - chiner des __s aux puces / snuisterij, prulletje - een plank vol snuisterijen - prulletjes zoeken op de vlooienmarkt

  // Noun, multiple senses:
  nerf [m] - avoir les __s à fleur de peau - taper sur les __s de quelqu'un ** ce cheval a du __ / (zenuw, irritatie) - de zenuwen tot het uiterste gespannen - iemand op de zenuwen werken ** (pit, kracht) - dat paard heeft pit

  // Verb, literal + figurative:
  chavirer [v] - le bateau a chaviré ** son cœur a chaviré en la voyant / (kapseizen, omslaan) - de boot is gekapseisd ** (ontroerd raken) - zijn hart sloeg over toen hij haar zag

  // Adjective, single sense:
  oisif [adj] - mener une vie __ - des mains oisives / lui, werkeloos - een lui leven leiden - handen die niets omhanden hebben

  // Register label, word level:
  morpion [m] (fam) - attraper des __s ** cet insupportable petit __ / (schaamluis) - schaamluizen hebben ** (uk, joch) - dat vervelende kleine joch

  // Adverb, register label:
  itou [adv] (fam) - moi __ - et toi __ / ook, insgelijks - ik ook - en jij dan

END

# Instructions:
# Only apply the rules in this pseudocode
# When pasted in a new chat, do not repeat it — offer to process input in this format
# Validate senses against Larousse before formatting
# I will indicate when I want to refine this pseudocode