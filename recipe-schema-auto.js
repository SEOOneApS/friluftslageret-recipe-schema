/**
 * Friluftslageret Recipe Schema Generator - AUTO VERSION
 *
 * VIGTIGT: Dette script finder opskriftsindhold ved at:
 * 1. Bruge page title som opskriftsnavn (mest pålidelig)
 * 2. Finde billede fra --bgimage CSS variabel
 * 3. Søge efter "Ingredienser" og "Fremgangsmåde" overskrifter
 * 4. Ignorere navigation, footer, popups via section ID'er
 */

(function() {
  'use strict';

  console.log('[RecipeSchema] VERSION 5 LOADED - ' + new Date().toISOString());

  var CONFIG = {
    pathPrefix: '/opskrifter/',
    defaults: {
      author: 'Friluftslageret',
      cuisine: 'Outdoor mad',
      category: 'Hovedret'
    },
    debug: true
  };

  function log() {
    if (CONFIG.debug) {
      console.log.apply(console, ['[RecipeSchema]'].concat(Array.prototype.slice.call(arguments)));
    }
  }

  function cleanText(text) {
    if (!text) return '';
    return text
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#(\d+);/g, function(match, code) {
        return String.fromCharCode(parseInt(code));
      })
      .replace(/\s+/g, ' ')
      .trim();
  }

  function minutesToISO(minutes) {
    if (!minutes || minutes <= 0) return null;
    var hours = Math.floor(minutes / 60);
    var mins = minutes % 60;
    if (hours > 0 && mins > 0) return 'PT' + hours + 'H' + mins + 'M';
    if (hours > 0) return 'PT' + hours + 'H';
    return 'PT' + mins + 'M';
  }

  // =====================================================
  // FIND HOVEDINDHOLD - Ignorer navigation, footer, popups
  // =====================================================

  function getMainContentSections() {
    // Find alle sections der IKKE er navigation, header, footer, eller popups
    var allSections = document.querySelectorAll('section[id]');
    var contentSections = [];

    for (var i = 0; i < allSections.length; i++) {
      var section = allSections[i];
      var id = (section.id || '').toLowerCase();

      // Spring over kendte ikke-indhold sektioner
      if (id.match(/nav|menu|header|footer|cookie|consent|login|modal|popup|banner/i)) {
        continue;
      }

      // Spring over sektioner der indeholder navigation-tekst
      var text = section.textContent.substring(0, 200).toLowerCase();
      if (text.match(/dame.*herre|herre.*dame|jakker.*bukser|rygsække.*telte/i)) {
        continue;
      }

      contentSections.push(section);
    }

    log('Fandt', contentSections.length, 'indhold-sektioner');
    return contentSections;
  }

  // =====================================================
  // EKSTRAKTION AF DATA
  // =====================================================

  function extractTitle() {
    var pageTitle = document.title;
    log('DEBUG: Rå document.title =', pageTitle);

    // Fjern site-navn (efter | eller -)
    var cleanTitle = pageTitle.split('|')[0].split(' - ')[0].split(' – ')[0].trim();
    log('DEBUG: Efter split cleanTitle =', cleanTitle);

    // Fjern "Opskrift:" prefix hvis det findes
    cleanTitle = cleanTitle.replace(/^opskrift:\s*/i, '');
    log('DEBUG: Efter prefix-fjernelse =', cleanTitle);

    // VIGTIG: Tjek om titlen er ugyldig (login-modal, cookie, etc)
    var invalidTitles = ['login med engangskode', 'login', 'log ind', 'cookie', 'samtykke'];
    var isInvalid = invalidTitles.indexOf(cleanTitle.toLowerCase()) !== -1 || cleanTitle.length < 5;
    log('DEBUG: Er titel ugyldig?', isInvalid, '| Titel lowercase:', cleanTitle.toLowerCase());

    if (isInvalid) {
      log('Page title er ugyldig:', cleanTitle, '- prøver OG title');

      // Fallback 1: Brug og:title
      var ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle && ogTitle.content) {
        cleanTitle = ogTitle.content.split('|')[0].split(' - ')[0].trim();
        if (cleanTitle.length > 5) {
          log('Bruger og:title:', cleanTitle);
          return cleanTitle;
        }
      }

      // Fallback 2: Brug URL
      var path = window.location.pathname;
      var urlTitle = path.replace('/opskrifter/', '').replace(/\/$/, '').replace(/-/g, ' ');
      // Capitalize first letter of each word
      urlTitle = urlTitle.split(' ').map(function(word) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }).join(' ');

      if (urlTitle.length > 3) {
        log('Bruger URL som titel:', urlTitle);
        return urlTitle;
      }
    }

    log('Bruger page title som navn:', cleanTitle);
    return cleanTitle;
  }

  function extractDescription() {
    var meta = document.querySelector('meta[name="description"]');
    if (meta && meta.content) return meta.content;

    var og = document.querySelector('meta[property="og:description"]');
    if (og && og.content) return og.content;

    return '';
  }

  function extractImage() {
    // 1. Find billede fra --bgimage CSS variabel i sections
    var sections = document.querySelectorAll('section[id], div[class*="header"], div[class*="hero"]');

    for (var i = 0; i < sections.length; i++) {
      var section = sections[i];

      // Tjek section selv
      var style = section.getAttribute('style') || '';

      // Tjek også children med style
      var styledChildren = section.querySelectorAll('[style*="bgimage"], [style*="background"]');

      var elementsToCheck = [section];
      for (var j = 0; j < styledChildren.length; j++) {
        elementsToCheck.push(styledChildren[j]);
      }

      for (var k = 0; k < elementsToCheck.length; k++) {
        var el = elementsToCheck[k];
        var elStyle = el.getAttribute('style') || '';

        // Match --bgimage: Url(/media/...)
        var match = elStyle.match(/--bgimage:\s*[Uu]rl\(([^)]+)\)/i);
        if (match && match[1]) {
          var path = match[1].replace(/['"]/g, '').split('?')[0];
          if (path.indexOf('/media/') !== -1) {
            var url = 'https://friluftslageret.dk' + path;
            log('Fandt billede fra --bgimage:', url);
            return [url];
          }
        }

        // Match også background-image: url(...)
        var bgMatch = elStyle.match(/background-image:\s*url\(([^)]+)\)/i);
        if (bgMatch && bgMatch[1]) {
          var bgPath = bgMatch[1].replace(/['"]/g, '').split('?')[0];
          if (bgPath.indexOf('/media/') !== -1 && bgPath.indexOf('pim.') === -1) {
            var bgUrl = bgPath.startsWith('http') ? bgPath : 'https://friluftslageret.dk' + bgPath;
            log('Fandt billede fra background-image:', bgUrl);
            return [bgUrl];
          }
        }
      }
    }

    // 2. Fallback: OG image
    var og = document.querySelector('meta[property="og:image"]');
    if (og && og.content) {
      var url = og.content;
      // Ignorer pim.friluftslageret.dk
      if (url.indexOf('pim.friluftslageret') === -1) {
        if (!url.startsWith('http')) {
          url = 'https://friluftslageret.dk' + url;
        }
        log('Fandt billede fra og:image:', url);
        return [url];
      }
    }

    // 3. Find første billede fra friluftslageret.dk/media/ (IKKE pim.)
    var imgs = document.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var src = imgs[i].src || imgs[i].dataset.src || '';

      // SKAL være fra friluftslageret.dk/media/ og IKKE fra pim.
      if (src.indexOf('friluftslageret.dk/media/') !== -1 &&
          src.indexOf('pim.friluftslageret') === -1) {
        log('Fandt billede fra img:', src.split('?')[0]);
        return [src.split('?')[0]];
      }
    }

    log('Intet billede fundet');
    return [];
  }

  function extractIngredients() {
    var ingredients = [];
    var contentSections = getMainContentSections();

    // Søg kun i indhold-sektioner
    for (var s = 0; s < contentSections.length; s++) {
      var section = contentSections[s];

      // Find "Ingredienser" overskrift i denne sektion
      var headings = section.querySelectorAll('h2, h3, h4, strong, b');

      for (var i = 0; i < headings.length; i++) {
        var heading = headings[i];
        var headingText = cleanText(heading.textContent);

        if (!/^ingrediens/i.test(headingText)) continue;

        log('Fandt Ingredienser overskrift i sektion:', section.id);

        // Find næste sibling elementer
        var parent = heading.closest('div') || heading.parentElement;
        var siblings = parent.querySelectorAll('p, ul, li');

        for (var j = 0; j < siblings.length; j++) {
          var el = siblings[j];

          if (el.tagName === 'P') {
            // Split på <br>
            var html = el.innerHTML;
            var parts = html.split(/<br\s*\/?>/gi);

            for (var k = 0; k < parts.length; k++) {
              var cleaned = cleanText(parts[k]);

              // Filtrer: ikke tom, ikke kun store bogstaver, ikke overskrifter
              if (cleaned.length > 3 &&
                  cleaned.length < 150 &&
                  !/^[A-ZÆØÅ\s:]+$/.test(cleaned) &&
                  !/^(DEJ|FYLD|TIL|SAUCE|INGREDIENSER|MARINADE)/i.test(cleaned)) {
                ingredients.push(cleaned);
              }
            }
          }

          if (el.tagName === 'LI') {
            var liText = cleanText(el.textContent);
            if (liText.length > 3 && liText.length < 150) {
              ingredients.push(liText);
            }
          }
        }

        // Stop efter første ingrediens-sektion
        if (ingredients.length > 0) break;
      }

      if (ingredients.length > 0) break;
    }

    // Fjern dubletter
    ingredients = ingredients.filter(function(item, index) {
      return ingredients.indexOf(item) === index;
    });

    log('Fandt ingredienser:', ingredients.length, ingredients);
    return ingredients;
  }

  function extractInstructions() {
    var instructions = [];
    var seenTexts = {}; // Til at undgå dubletter
    var contentSections = getMainContentSections();
    var currentSectionName = '';
    var stepCounter = 0;

    for (var s = 0; s < contentSections.length; s++) {
      var section = contentSections[s];

      // Find fremgangsmåde-relaterede overskrifter
      var headings = section.querySelectorAll('h2, h3, h4, strong, b');
      var foundStart = false;

      for (var i = 0; i < headings.length; i++) {
        var heading = headings[i];
        var headingText = cleanText(heading.textContent);

        // Start ved Fremgangsmåde, Tilberedning, Sådan gør du, FORBEREDELSE, TILBEREDNING
        if (/^(fremgangsm|tilbered|sådan gør|forberedelse$|tilberedning$)/i.test(headingText)) {
          foundStart = true;
          currentSectionName = headingText;
          log('Fandt instruktions-start:', headingText, 'i sektion:', section.id);
          continue;
        }

        if (!foundStart) continue;

        // Opdater sektion-navn for FORBEREDELSE/TILBEREDNING
        if (/^(FORBEREDELSE|TILBEREDNING)$/i.test(headingText)) {
          currentSectionName = headingText;
          continue;
        }

        // Stop ved andre overskrifter
        if (heading.tagName.match(/^H[2-3]$/) && headingText.length > 0) {
          break;
        }
      }

      if (!foundStart) continue;

      // Find nummererede trin i paragraphs
      var paragraphs = section.querySelectorAll('p');

      for (var j = 0; j < paragraphs.length; j++) {
        var p = paragraphs[j];
        var pText = cleanText(p.textContent);

        // Match "1. Gør dette" format
        var stepMatch = pText.match(/^(\d+)[\.\):\s]+(.+)/);

        if (stepMatch && stepMatch[2].length > 15) {
          var stepText = stepMatch[2];

          // Ignorer hvis det ligner navigation/menu
          if (stepText.match(/dame|herre|jakker|bukser|rygsække|telte|kogegrej|sovegrej/i)) {
            continue;
          }

          // Ignorer hvis det ligner cookie/login tekst
          if (stepText.match(/cookie|samtykke|login|engangskode|browser|password/i)) {
            continue;
          }

          // Ignorer "Ofte stillede spørgsmål" og lignende
          if (stepText.match(/^ofte\s+stillede|^FAQ|^spørgsmål/i)) {
            continue;
          }

          // Ignorer hvis teksten indeholder ingrediensliste (typisk fejl)
          if (stepText.match(/^\d+\s*(g|ml|dl|stk|fed)\s+/)) {
            continue;
          }

          // VIGTIG: Deduplikering - tjek om vi allerede har set denne tekst
          var textKey = stepText.substring(0, 50).toLowerCase();
          if (seenTexts[textKey]) {
            log('Springer over duplikat trin:', stepText.substring(0, 40));
            continue;
          }
          seenTexts[textKey] = true;

          stepCounter++;
          instructions.push({
            name: 'Trin ' + stepCounter,
            text: stepText
          });

          // Max 15 trin - normale opskrifter har ikke flere
          if (stepCounter >= 15) {
            log('Stopper ved 15 trin');
            break;
          }
        }
      }

      if (instructions.length > 0) break;
    }

    log('Fandt instruktioner:', instructions.length);
    return instructions;
  }

  function extractVideo() {
    var iframe = document.querySelector('iframe[src*="youtube"], iframe[src*="youtu.be"]');
    if (iframe) {
      var embedUrl = iframe.src.split('?')[0];
      return {
        "@type": "VideoObject",
        "embedUrl": embedUrl
      };
    }
    return null;
  }

  function extractYield() {
    var contentSections = getMainContentSections();

    for (var i = 0; i < contentSections.length; i++) {
      var text = contentSections[i].textContent;

      var patterns = [
        /(\d+)\s*(?:små\s+)?pizzaer/i,
        /(\d+)\s*portion/i,
        /(\d+)\s*person/i,
        /til\s+(\d+)\s+person/i
      ];

      for (var j = 0; j < patterns.length; j++) {
        var match = text.match(patterns[j]);
        if (match) {
          return match[0];
        }
      }
    }
    return '';
  }

  function extractTimes() {
    var contentSections = getMainContentSections();
    var times = { prep: 0, cook: 0 };

    for (var i = 0; i < contentSections.length; i++) {
      var text = contentSections[i].textContent;

      var riseMatch = text.match(/hæv\w*\s+(\d+)[-–]?(\d+)?\s*(time|timer|min)/i);
      if (riseMatch) {
        var riseTime = riseMatch[2] ? parseInt(riseMatch[2]) : parseInt(riseMatch[1]);
        times.prep += /time/i.test(riseMatch[3]) ? riseTime * 60 : riseTime;
      }

      var cookPatterns = [
        /(\d+)[-–](\d+)\s*min\w*\s+(?:afhængig|over|i ovnen)/i,
        /bag\w*\s+i?\s*(\d+)[-–]?(\d+)?\s*(time|timer|min)/i,
        /kog\w*\s+i?\s*(\d+)[-–]?(\d+)?\s*(time|timer|min)/i
      ];

      for (var j = 0; j < cookPatterns.length; j++) {
        var cookMatch = text.match(cookPatterns[j]);
        if (cookMatch && !times.cook) {
          var cookTime = cookMatch[2] ? parseInt(cookMatch[2]) : parseInt(cookMatch[1]);
          times.cook = cookMatch[3] && /time/i.test(cookMatch[3]) ? cookTime * 60 : cookTime;
        }
      }
    }

    return times;
  }

  function generateKeywords() {
    var path = window.location.pathname.toLowerCase();
    var keywords = [];

    var urlWords = path.replace('/opskrifter/', '').replace(/\/$/, '').split('-');
    urlWords.forEach(function(word) {
      if (word.length > 2) keywords.push(word);
    });

    if (/dutch|oven|støbejern/i.test(path)) keywords.push('dutch oven');
    if (/bål|baal/i.test(path)) keywords.push('bålmad');
    if (/grill/i.test(path)) keywords.push('grillmad');

    keywords.push('outdoor opskrift');
    keywords.push('friluftsmad');

    return keywords.filter(function(k, i) { return keywords.indexOf(k) === i; }).join(', ');
  }

  // =====================================================
  // BYGG SCHEMA
  // =====================================================

  function buildSchema() {
    var times = extractTimes();
    var totalTime = times.prep + times.cook;

    var schema = {
      "@context": "https://schema.org",
      "@type": "Recipe",
      "name": extractTitle(),
      "description": extractDescription(),
      "author": {
        "@type": "Organization",
        "name": CONFIG.defaults.author
      },
      "datePublished": new Date().toISOString().split('T')[0],
      "recipeCategory": CONFIG.defaults.category,
      "recipeCuisine": CONFIG.defaults.cuisine
    };

    var images = extractImage();
    if (images.length > 0) schema.image = images;

    var recipeYield = extractYield();
    if (recipeYield) schema.recipeYield = recipeYield;

    if (times.prep > 0) schema.prepTime = minutesToISO(times.prep);
    if (times.cook > 0) schema.cookTime = minutesToISO(times.cook);
    if (totalTime > 0) schema.totalTime = minutesToISO(totalTime);

    schema.keywords = generateKeywords();

    var ingredients = extractIngredients();
    if (ingredients.length > 0) schema.recipeIngredient = ingredients;

    var instructions = extractInstructions();
    if (instructions.length > 0) {
      schema.recipeInstructions = instructions.map(function(step) {
        return {
          "@type": "HowToStep",
          "name": step.name,
          "text": step.text
        };
      });
    }

    var video = extractVideo();
    if (video) {
      video.name = schema.name;
      video.description = schema.description;
      schema.video = video;
    }

    return schema;
  }

  function removeExistingRecipeSchemas() {
    // Find og fjern ALLE eksisterende Recipe schemas på siden
    var existingSchemas = document.querySelectorAll('script[type="application/ld+json"]');
    var removedCount = 0;

    for (var i = 0; i < existingSchemas.length; i++) {
      var script = existingSchemas[i];
      try {
        var content = JSON.parse(script.textContent);

        // Tjek om det er en Recipe schema
        var isRecipe = false;
        if (content['@type'] === 'Recipe') {
          isRecipe = true;
        } else if (Array.isArray(content['@graph'])) {
          // Tjek @graph array
          for (var j = 0; j < content['@graph'].length; j++) {
            if (content['@graph'][j]['@type'] === 'Recipe') {
              isRecipe = true;
              break;
            }
          }
        }

        if (isRecipe) {
          script.parentNode.removeChild(script);
          removedCount++;
          log('Fjernede eksisterende Recipe schema');
        }
      } catch (e) {
        // Ikke valid JSON, ignorer
      }
    }

    return removedCount;
  }

  function injectSchema(schema) {
    // FØRST: Fjern alle eksisterende Recipe schemas
    var removed = removeExistingRecipeSchemas();
    if (removed > 0) {
      log('Fjernede', removed, 'eksisterende schema(s)');
    }

    // Opret ny script tag med vores schema
    var script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-recipe-schema', 'auto-generated');
    script.textContent = JSON.stringify(schema, null, 2);
    document.head.appendChild(script);

    log('Schema injiceret:', schema.name);
    if (CONFIG.debug) {
      console.log('[RecipeSchema] Genereret schema:', JSON.stringify(schema, null, 2));
    }
  }

  function init() {
    if (!window.location.pathname.startsWith(CONFIG.pathPrefix)) {
      return;
    }

    log('Kører på opskriftsside:', window.location.pathname);

    try {
      var schema = buildSchema();

      if (!schema.name || schema.name.length < 3) {
        log('Kunne ikke finde titel - afbryder');
        return;
      }

      if (!schema.recipeIngredient || schema.recipeIngredient.length === 0) {
        log('Ingen ingredienser fundet - afbryder');
        return;
      }

      injectSchema(schema);

    } catch (e) {
      console.error('[RecipeSchema] Fejl:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
