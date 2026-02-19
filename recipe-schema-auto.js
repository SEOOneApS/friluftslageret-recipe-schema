/**
 * Friluftslageret Recipe Schema Generator - AUTO VERSION
 *
 * Automatisk generering af schema.org Recipe markup.
 * Scriptet parser HTML-strukturen på opskriftssider og
 * genererer JSON-LD uden manuel konfiguration.
 *
 * Tilpasset Friluftslageret.dk's HTML-struktur:
 * - Titel i <h2> eller <h1>
 * - Ingredienser som tekst med <br> separatorer
 * - Sektioner markeret med <h4> (FORBEREDELSE, TILBEREDNING)
 * - Trin som nummereret tekst (1. 2. 3. etc.)
 */

(function() {
  'use strict';

  // =====================================================
  // KONFIGURATION
  // =====================================================

  var CONFIG = {
    // Kun kør på disse URL-paths
    pathPrefix: '/opskrifter/',

    // Standard værdier
    defaults: {
      author: 'Friluftslageret',
      cuisine: 'Outdoor mad',
      category: 'Hovedret'
    },

    // Debug mode (sæt til true for console logs)
    debug: true
  };

  // =====================================================
  // HJÆLPEFUNKTIONER
  // =====================================================

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
      .replace(/&#\d+;/g, function(match) {
        return String.fromCharCode(parseInt(match.replace(/&#|;/g, '')));
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
    // Friluftslageret bruger h1 til titel
    var h1 = document.querySelector('h1');
    if (h1) {
      var text = cleanText(h1.textContent);
      if (text.length > 3 && text.length < 200) {
        log('Fandt titel fra h1:', text);
        return text;
      }
    }

    // Fallback til h2
    var h2 = document.querySelector('h2');
    if (h2) {
      var text = cleanText(h2.textContent);
      if (text.length > 3 && text.length < 200) {
        return text;
      }
    }

    // Sidste fallback: page title
    return document.title.split('|')[0].split('-')[0].trim();
  }

  function extractDescription() {
    // Meta description
    var meta = document.querySelector('meta[name="description"]');
    if (meta && meta.content) return meta.content;

    // OG description
    var og = document.querySelector('meta[property="og:description"]');
    if (og && og.content) return og.content;

    // Første relevante paragraph
    var paragraphs = document.querySelectorAll('p');
    for (var i = 0; i < paragraphs.length; i++) {
      var text = cleanText(paragraphs[i].textContent);
      if (text.length > 80 && text.length < 500) {
        return text.substring(0, 200) + (text.length > 200 ? '...' : '');
      }
    }

    return '';
  }

  function extractIngredients() {
    var ingredients = [];
    var foundSection = false;

    // Find alle elementer og søg efter ingrediens-sektion
    var allElements = document.body.querySelectorAll('*');

    for (var i = 0; i < allElements.length; i++) {
      var el = allElements[i];
      var text = el.textContent || '';

      // Find "Ingredienser" overskrift
      if (!foundSection && /^ingrediens/i.test(text.trim()) && el.tagName.match(/^(H[1-6]|STRONG|B)$/)) {
        foundSection = true;
        log('Fandt ingrediens-sektion ved:', el.tagName);
        continue;
      }

      // Når vi har fundet sektionen, saml ingredienser
      if (foundSection) {
        // Stop ved næste sektion
        if (el.tagName.match(/^H[1-4]$/) && !/ingrediens|dej|fyld/i.test(text)) {
          break;
        }

        // Parse paragraphs med <br> tags
        if (el.tagName === 'P') {
          var html = el.innerHTML;
          var parts = html.split(/<br\s*\/?>/i);

          parts.forEach(function(part) {
            var cleaned = cleanText(part);
            // Filtrer tomme, korte og overskrifter (kun store bogstaver)
            if (cleaned.length > 3 &&
                cleaned.length < 200 &&
                !/^[A-ZÆØÅ\s:]+$/.test(cleaned) &&
                !/^(DEJ|FYLD|TIL|INGREDIENSER)/i.test(cleaned)) {
              ingredients.push(cleaned);
            }
          });
        }

        // Parse liste-elementer
        if (el.tagName === 'LI') {
          var liText = cleanText(el.textContent);
          if (liText.length > 3 && liText.length < 200) {
            ingredients.push(liText);
          }
        }
      }
    }

    // Fjern dubletter
    ingredients = ingredients.filter(function(item, index) {
      return ingredients.indexOf(item) === index;
    });

    log('Fandt ingredienser:', ingredients);
    return ingredients;
  }

  function extractInstructions() {
    var instructions = [];
    var foundSection = false;
    var currentSection = '';

    // Søg efter fremgangsmåde-sektion
    var allElements = document.body.querySelectorAll('h2, h3, h4, p, li, ol, ul');

    for (var i = 0; i < allElements.length; i++) {
      var el = allElements[i];
      var text = cleanText(el.textContent);

      // Find sektion-start
      if (/^(fremgangsm|tilbered|sådan|forbered)/i.test(text) && el.tagName.match(/^H[2-4]$/)) {
        foundSection = true;
        currentSection = text;
        log('Fandt instruktions-sektion:', text);
        continue;
      }

      if (foundSection) {
        // Under-sektioner (FORBEREDELSE, TILBEREDNING)
        if (el.tagName === 'H4') {
          currentSection = text;
          continue;
        }

        // Stop ved produkt-sektion eller lignende
        if (/^(produkt|udstyr|tip|relateret)/i.test(text) && el.tagName.match(/^H[2-4]$/)) {
          break;
        }

        // Parse nummererede trin fra paragraphs
        if (el.tagName === 'P') {
          // Match nummererede trin: "1. Gør dette" eller "Trin 1: Gør dette"
          var stepMatch = text.match(/^(\d+)[\.\):\s]+(.+)/);
          if (stepMatch) {
            instructions.push({
              name: currentSection ? currentSection + ' - Trin ' + stepMatch[1] : 'Trin ' + stepMatch[1],
              text: stepMatch[2]
            });
          } else if (text.length > 30 && instructions.length < 20) {
            // Lang paragraph der kan være et trin
            instructions.push({
              name: 'Trin ' + (instructions.length + 1),
              text: text
            });
          }
        }

        // Parse liste-elementer
        if (el.tagName === 'LI' && text.length > 20) {
          instructions.push({
            name: 'Trin ' + (instructions.length + 1),
            text: text
          });
        }
      }
    }

    log('Fandt instruktioner:', instructions.length);
    return instructions;
  }

  function extractImage() {
    // Først: Find billede fra --bgimage i style attribut (header billede)
    var bgElements = document.querySelectorAll('[style*="--bgimage"]');
    for (var i = 0; i < bgElements.length; i++) {
      var style = bgElements[i].getAttribute('style');
      if (style) {
        // Match: --bgimage: Url(/media/65242/desktop-header.jpg...)
        var match = style.match(/--bgimage:\s*[Uu]rl\(([^)]+)\)/);
        if (match && match[1]) {
          var path = match[1].split('?')[0]; // Fjern query parameters
          var url = 'https://friluftslageret.dk' + path;
          log('Fandt billede fra --bgimage:', url);
          return [url];
        }
      }
    }

    // Fallback: OG image
    var og = document.querySelector('meta[property="og:image"]');
    if (og && og.content) {
      var url = og.content;
      if (!url.startsWith('http')) {
        url = 'https://friluftslageret.dk' + url;
      }
      return [url];
    }

    // Sidste fallback: Første store billede
    var imgs = document.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (img.width > 300 || img.naturalWidth > 300) {
        var src = img.src || img.dataset.src;
        if (src && !src.includes('logo') && !src.includes('icon')) {
          return [src];
        }
      }
    }

    return [];
  }

  function extractVideo() {
    var iframe = document.querySelector('iframe[src*="youtube"], iframe[src*="youtu.be"]');
    if (iframe) {
      var src = iframe.src;
      // Rens URL for parametre
      var embedUrl = src.split('?')[0];
      return {
        "@type": "VideoObject",
        "embedUrl": embedUrl
      };
    }
    return null;
  }

  function extractYield() {
    var text = document.body.innerText;

    // Søg efter portion/personer
    var patterns = [
      /(\d+)\s*(?:små\s+)?pizzaer/i,
      /(\d+)\s*portion/i,
      /(\d+)\s*person/i,
      /(\d+)\s*stk/i,
      /til\s+(\d+)/i
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

    // Hævningstid (for brød/pizza)
    var riseMatch = text.match(/hæv\w*\s+(\d+)[-–]?(\d+)?\s*(time|timer|min)/i);
    if (riseMatch) {
      var riseTime = riseMatch[2] ? parseInt(riseMatch[2]) : parseInt(riseMatch[1]);
      if (/time/i.test(riseMatch[3])) {
        times.prep += riseTime * 60;
      } else {
        times.prep += riseTime;
      }
    }

    // Bagetid/tilberedningstid
    var cookPatterns = [
      /bag\w*\s+(\d+)[-–]?(\d+)?\s*(time|timer|min)/i,
      /tilbered\w*\s+(\d+)[-–]?(\d+)?\s*(time|timer|min)/i,
      /(\d+)[-–](\d+)\s*min\w*\s+(?:afhængig|over)/i
    ];

    for (var i = 0; i < cookPatterns.length; i++) {
      var cookMatch = text.match(cookPatterns[i]);
      if (cookMatch) {
        var cookTime = cookMatch[2] ? parseInt(cookMatch[2]) : parseInt(cookMatch[1]);
        if (cookMatch[3] && /time/i.test(cookMatch[3])) {
          times.cook = cookTime * 60;
        } else {
          times.cook = cookTime;
        }
        break;
      }
    }

    log('Udtrak tider:', times);
    return times;
  }

  function generateKeywords() {
    var title = extractTitle().toLowerCase();
    var path = window.location.pathname.toLowerCase();
    var keywords = [];

    // Fra URL
    var urlWords = path.replace('/opskrifter/', '').split('-');
    urlWords.forEach(function(word) {
      if (word.length > 2) keywords.push(word);
    });

    // Standard outdoor keywords
    if (/dutch\s*oven|støbejern/i.test(title + path)) keywords.push('dutch oven');
    if (/bål|lejrbål|campfire/i.test(title + path)) keywords.push('bålmad');
    if (/grill/i.test(title + path)) keywords.push('grillmad');

    keywords.push('outdoor opskrift');
    keywords.push('friluftsmad');

    // Fjern dubletter og join
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

    // Billede
    var images = extractImage();
    if (images.length > 0) schema.image = images;

    // Portioner
    var recipeYield = extractYield();
    if (recipeYield) schema.recipeYield = recipeYield;

    // Tider
    if (times.prep > 0) schema.prepTime = minutesToISO(times.prep);
    if (times.cook > 0) schema.cookTime = minutesToISO(times.cook);
    if (totalTime > 0) schema.totalTime = minutesToISO(totalTime);

    // Keywords
    schema.keywords = generateKeywords();

    // Ingredienser
    var ingredients = extractIngredients();
    if (ingredients.length > 0) schema.recipeIngredient = ingredients;

    // Instruktioner
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

    // Video
    var video = extractVideo();
    if (video) {
      video.name = schema.name;
      video.description = schema.description;
      schema.video = video;
    }

    return schema;
  }

  // =====================================================
  // INJEKTION
  // =====================================================

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

  // =====================================================
  // HOVEDFUNKTION
  // =====================================================

  function init() {
    // Tjek at vi er på en opskriftsside
    if (!window.location.pathname.startsWith(CONFIG.pathPrefix)) {
      return;
    }

    log('Kører på opskriftsside:', window.location.pathname);

    try {
      var schema = buildSchema();

      // Validér at vi har nok data
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

  // Kør når DOM er klar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
