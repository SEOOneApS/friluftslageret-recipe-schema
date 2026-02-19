/**
 * Friluftslageret Recipe Schema Generator - AUTO VERSION
 *
 * Automatisk generering af schema.org Recipe markup.
 * Tilpasset Friluftslageret.dk's HTML-struktur.
 */

(function() {
  'use strict';

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
  // EKSTRAKTION AF DATA
  // =====================================================

  function extractTitle() {
    // Find h1 der IKKE er i modal/popup/login
    // Brug article eller main content område hvis muligt
    var mainContent = document.querySelector('article, main, .content, .recipe, section[class*="content"]');
    var searchArea = mainContent || document.body;

    var h1Elements = searchArea.querySelectorAll('h1');
    for (var i = 0; i < h1Elements.length; i++) {
      var h1 = h1Elements[i];
      var text = cleanText(h1.textContent);

      // Spring over hvis det ligner login/cookie tekst
      if (text.match(/login|log ind|cookie|engangskode|samtykke|accept/i)) {
        continue;
      }

      if (text.length > 3 && text.length < 200) {
        log('Fandt titel fra h1:', text);
        return text;
      }
    }

    // Fallback: Brug page title og fjern site-navn
    var pageTitle = document.title;
    var cleanTitle = pageTitle.split('|')[0].split('-')[0].split('–')[0].trim();
    log('Bruger page title som fallback:', cleanTitle);
    return cleanTitle;
  }

  function extractDescription() {
    // Meta description er mest pålidelig
    var meta = document.querySelector('meta[name="description"]');
    if (meta && meta.content) return meta.content;

    var og = document.querySelector('meta[property="og:description"]');
    if (og && og.content) return og.content;

    return '';
  }

  function extractImage() {
    // 1. Find billede fra --bgimage CSS variabel (header billede)
    var allElements = document.querySelectorAll('*');
    for (var i = 0; i < allElements.length; i++) {
      var el = allElements[i];
      var style = el.getAttribute('style');
      if (style && style.indexOf('--bgimage') !== -1) {
        // Match: --bgimage: Url(/media/65242/desktop-header.jpg...)
        var match = style.match(/--bgimage:\s*[Uu]rl\(([^)]+)\)/i);
        if (match && match[1]) {
          var path = match[1].split('?')[0].replace(/['"]/g, ''); // Fjern query params og quotes
          if (path.startsWith('/media/')) {
            var url = 'https://friluftslageret.dk' + path;
            log('Fandt billede fra --bgimage:', url);
            return [url];
          }
        }
      }
    }

    // 2. Fallback: OG image
    var og = document.querySelector('meta[property="og:image"]');
    if (og && og.content) {
      var url = og.content;
      if (!url.startsWith('http')) {
        url = 'https://friluftslageret.dk' + url;
      }
      log('Fandt billede fra og:image:', url);
      return [url];
    }

    // 3. Find første billede fra /media/ mappe
    var imgs = document.querySelectorAll('img[src*="/media/"], img[data-src*="/media/"]');
    for (var i = 0; i < imgs.length; i++) {
      var src = imgs[i].src || imgs[i].dataset.src;
      if (src && src.indexOf('/media/') !== -1) {
        if (!src.startsWith('http')) {
          src = 'https://friluftslageret.dk' + src;
        }
        log('Fandt billede fra img tag:', src);
        return [src.split('?')[0]];
      }
    }

    return [];
  }

  function extractIngredients() {
    var ingredients = [];
    var foundSection = false;

    // Find "Ingredienser" overskrift og tag indhold derfra
    var headings = document.querySelectorAll('h2, h3, h4, strong, b');
    var ingredientHeading = null;

    for (var i = 0; i < headings.length; i++) {
      var text = cleanText(headings[i].textContent);
      if (/^ingrediens/i.test(text)) {
        ingredientHeading = headings[i];
        log('Fandt ingrediens-overskrift:', text);
        break;
      }
    }

    if (!ingredientHeading) {
      log('Ingen ingrediens-sektion fundet');
      return [];
    }

    // Find parent container og søg efter ingredienser deri
    var container = ingredientHeading.closest('div, section, article') || ingredientHeading.parentElement;

    // Søg i efterfølgende elementer
    var sibling = ingredientHeading.nextElementSibling || (ingredientHeading.parentElement ? ingredientHeading.parentElement.nextElementSibling : null);

    while (sibling) {
      var tagName = sibling.tagName;
      var text = cleanText(sibling.textContent);

      // Stop ved næste sektion
      if (tagName.match(/^H[1-4]$/) && text.length > 0 && !/ingrediens|dej|fyld/i.test(text)) {
        break;
      }

      // Parse paragraphs med <br> tags
      if (tagName === 'P') {
        var html = sibling.innerHTML;
        var parts = html.split(/<br\s*\/?>/i);

        parts.forEach(function(part) {
          var cleaned = cleanText(part);
          // Filtrer tomme, korte og overskrifter
          if (cleaned.length > 3 &&
              cleaned.length < 200 &&
              !/^[A-ZÆØÅ\s:]+$/.test(cleaned) &&
              !/^(DEJ|FYLD|TIL|INGREDIENSER|SAUCE|MARINADE)/i.test(cleaned)) {
            ingredients.push(cleaned);
          }
        });
      }

      // Parse liste-elementer
      if (tagName === 'UL' || tagName === 'OL') {
        var items = sibling.querySelectorAll('li');
        items.forEach(function(li) {
          var liText = cleanText(li.textContent);
          if (liText.length > 3 && liText.length < 200) {
            ingredients.push(liText);
          }
        });
      }

      sibling = sibling.nextElementSibling;
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
    var currentSection = '';

    // Find fremgangsmåde/tilberedning sektion
    var headings = document.querySelectorAll('h2, h3, h4, strong, b');
    var instructionHeading = null;

    for (var i = 0; i < headings.length; i++) {
      var text = cleanText(headings[i].textContent);
      if (/^(fremgangsm|tilbered|sådan gør)/i.test(text)) {
        instructionHeading = headings[i];
        currentSection = text;
        log('Fandt instruktions-overskrift:', text);
        break;
      }
    }

    if (!instructionHeading) {
      // Prøv at finde FORBEREDELSE eller TILBEREDNING direkte
      for (var i = 0; i < headings.length; i++) {
        var text = cleanText(headings[i].textContent);
        if (/^(FORBEREDELSE|TILBEREDNING)/i.test(text)) {
          instructionHeading = headings[i];
          currentSection = text;
          log('Fandt instruktions-sektion:', text);
          break;
        }
      }
    }

    if (!instructionHeading) {
      log('Ingen instruktions-sektion fundet');
      return [];
    }

    // Søg fra denne overskrift
    var sibling = instructionHeading.nextElementSibling || (instructionHeading.parentElement ? instructionHeading.parentElement.nextElementSibling : null);

    while (sibling) {
      var tagName = sibling.tagName;
      var text = cleanText(sibling.textContent);

      // Stop ved produkt-sektion eller lignende
      if (tagName.match(/^H[1-3]$/) && /^(produkt|udstyr|se også|relateret|opskrift)/i.test(text)) {
        break;
      }

      // Under-sektioner (FORBEREDELSE, TILBEREDNING)
      if ((tagName === 'H4' || tagName === 'STRONG' || tagName === 'B') && /^(FORBEREDELSE|TILBEREDNING)/i.test(text)) {
        currentSection = text;
        sibling = sibling.nextElementSibling;
        continue;
      }

      // Parse nummererede trin fra paragraphs
      if (tagName === 'P') {
        var stepMatch = text.match(/^(\d+)[\.\):\s]+(.+)/);
        if (stepMatch && stepMatch[2].length > 10) {
          instructions.push({
            name: currentSection ? currentSection + ' - Trin ' + stepMatch[1] : 'Trin ' + stepMatch[1],
            text: stepMatch[2]
          });
        }
      }

      // Parse liste-elementer
      if (tagName === 'OL' || tagName === 'UL') {
        var items = sibling.querySelectorAll('li');
        items.forEach(function(li, index) {
          var liText = cleanText(li.textContent);
          if (liText.length > 15) {
            instructions.push({
              name: currentSection ? currentSection + ' - Trin ' + (index + 1) : 'Trin ' + (instructions.length + 1),
              text: liText
            });
          }
        });
      }

      sibling = sibling.nextElementSibling;
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
    var text = document.body.innerText;
    var patterns = [
      /(\d+)\s*(?:små\s+)?pizzaer/i,
      /(\d+)\s*portion/i,
      /(\d+)\s*person/i,
      /(\d+)\s*stk/i,
      /til\s+(\d+)\s+person/i
    ];

    for (var i = 0; i < patterns.length; i++) {
      var match = text.match(patterns[i]);
      if (match) {
        return match[0];
      }
    }
    return '';
  }

  function extractTimes() {
    var text = document.body.innerText;
    var times = { prep: 0, cook: 0 };

    var riseMatch = text.match(/hæv\w*\s+(\d+)[-–]?(\d+)?\s*(time|timer|min)/i);
    if (riseMatch) {
      var riseTime = riseMatch[2] ? parseInt(riseMatch[2]) : parseInt(riseMatch[1]);
      times.prep += /time/i.test(riseMatch[3]) ? riseTime * 60 : riseTime;
    }

    var cookPatterns = [
      /bag\w*\s+(\d+)[-–]?(\d+)?\s*(time|timer|min)/i,
      /tilbered\w*\s+(\d+)[-–]?(\d+)?\s*(time|timer|min)/i,
      /(\d+)[-–](\d+)\s*min\w*\s+(?:afhængig|over)/i
    ];

    for (var i = 0; i < cookPatterns.length; i++) {
      var cookMatch = text.match(cookPatterns[i]);
      if (cookMatch) {
        var cookTime = cookMatch[2] ? parseInt(cookMatch[2]) : parseInt(cookMatch[1]);
        times.cook = cookMatch[3] && /time/i.test(cookMatch[3]) ? cookTime * 60 : cookTime;
        break;
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

  function injectSchema(schema) {
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
