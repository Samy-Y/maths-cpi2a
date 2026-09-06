/**
 * Automated LaTeX (coursmodern.sty) to HTML Converter
 * Generates continuous-reading, responsive, Swiss Modern HTML
 * with vector SVG TikZ figures and MathJax 3.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import * as mupdf from './node_modules/mupdf/dist/mupdf.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const TOOLS_DIR = __dirname;
const TMP_DIR = path.join(TOOLS_DIR, '.tmp');

// Ensure temporary directory exists
if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
}

// ── Environment Metadata Configuration ──────────────────────────────────────
const ENV_CONFIG = {
    definition: { label: 'Définition', icon: 'fas fa-book', color: '#0284C7', counter: true },
    theorem: { label: 'Théorème', icon: 'fas fa-star', color: '#4F46E5', counter: true },
    property: { label: 'Propriété', icon: 'fas fa-sliders-h', color: '#0D9488', counter: true },
    consequence: { label: 'Conséquence', icon: 'fas fa-level-down-alt', color: '#0284C7', counter: true },
    corollary: { label: 'Corollaire', icon: 'fas fa-angle-double-right', color: '#2563EB', counter: true },
    application: { label: 'Application', icon: 'fas fa-rocket', color: '#059669', counter: true },
    remark: { label: 'Remarque', icon: 'fas fa-comment-dots', color: '#475569', counter: false },
    example: { label: 'Exemple', icon: 'fas fa-lightbulb', color: '#D97706', counter: true },
    attention: { label: 'Attention !', icon: 'fas fa-exclamation-triangle', color: '#DC2626', counter: false },
    exercise: { label: 'Exercice', icon: 'fas fa-drafting-compass', color: '#7C3AED', counter: true, hasStars: true },
    correction: { label: 'Correction', icon: 'fas fa-check-double', color: '#15803D', counter: false },
    methodbox: { label: 'Méthode', icon: 'fas fa-magic', color: '#C026D3', counter: false }
};

const COLOR_MAP = {
    cDef: '#0284C7',
    cThm: '#4F46E5',
    cProp: '#0D9488',
    cCons: '#0284C7',
    cCor: '#2563EB',
    cApp: '#059669',
    cRem: '#475569',
    cEx: '#D97706',
    cAtt: '#DC2626',
    cExo: '#7C3AED',
    cCorr: '#15803D',
    cMeth: '#C026D3',
    swissdark: '#334155',
    swissblack: '#0F172A',
    swissgray: '#64748B'
};

const FA_MAP = {
    '\\faMicrochip': 'fas fa-microchip',
    '\\faBook': 'fas fa-book',
    '\\faStar': 'fas fa-star',
    '\\faLightbulb': 'fas fa-lightbulb',
    '\\faRocket': 'fas fa-rocket',
    '\\faMagic': 'fas fa-magic',
    '\\faCogs': 'fas fa-cogs',
    '\\faChartLine': 'fas fa-chart-line',
    '\\faCheckDouble': 'fas fa-check-double',
    '\\faSlidersH': 'fas fa-sliders-h'
};

/**
 * Extract content inside balanced curly braces starting from openIndex
 */
function extractBalancedBraces(str, openIndex) {
    let depth = 0;
    let start = -1;
    for (let i = openIndex; i < str.length; i++) {
        if (str[i] === '{') {
            if (depth === 0) start = i + 1;
            depth++;
        } else if (str[i] === '}') {
            depth--;
            if (depth === 0) {
                return { content: str.substring(start, i), endPos: i };
            }
        }
    }
    return null;
}

/**
 * Format date in French
 */
function getFrenchDate(date = new Date()) {
    return date.toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

/**
 * Clean LaTeX text (unescape \&, etc.)
 */
function cleanLatexText(text) {
    if (!text) return '';
    return text
        .replace(/\\&/g, '&')
        .replace(/\\%/g, '%')
        .replace(/\\_/g, '_')
        .replace(/---/g, '—')
        .replace(/--/g, '–');
}

/**
 * Extract matched macro argument e.g. \CourseTitle{...}
 */
function extractMacro(content, macroName, defaultValue = '') {
    const pattern = `\\${macroName}`;
    const idx = content.indexOf(pattern);
    if (idx === -1) return defaultValue;
    const braceIdx = content.indexOf('{', idx + pattern.length);
    if (braceIdx === -1) return defaultValue;
    const balanced = extractBalancedBraces(content, braceIdx);
    return balanced ? cleanLatexText(balanced.content.trim()) : defaultValue;
}

/**
 * Extract double macro argument e.g. \PrimarySite{text}{url}
 */
function extractDoubleMacro(content, macroName) {
    const pattern = `\\${macroName}`;
    const idx = content.indexOf(pattern);
    if (idx === -1) return null;
    const brace1 = content.indexOf('{', idx + pattern.length);
    if (brace1 === -1) return null;
    const bal1 = extractBalancedBraces(content, brace1);
    if (!bal1) return null;
    const brace2 = content.indexOf('{', bal1.endPos + 1);
    if (brace2 === -1) return null;
    const bal2 = extractBalancedBraces(content, brace2);
    if (!bal2) return null;
    return {
        text: cleanLatexText(bal1.content.trim()),
        url: bal2.content.trim()
    };
}

/**
 * Generate difficulty stars HTML
 */
function generateStarsHtml(count) {
    const num = parseInt(count, 10) || 0;
    if (num <= 0) return '';
    let stars = '';
    for (let i = 0; i < Math.min(num, 3); i++) {
        stars += '<i class="fas fa-star" aria-hidden="true"></i>';
    }
    return `<span class="env-stars" title="${num} étoile(s)">${stars}</span>`;
}

/**
 * Compile a standalone TikZ snippet to Vector SVG via XeLaTeX and MuPDF
 */
function compileTikZToSvg(tikzSource, index) {
    const texName = `fig_${index}.tex`;
    const pdfName = `fig_${index}.pdf`;
    const texPath = path.join(TMP_DIR, texName);
    const pdfPath = path.join(TMP_DIR, pdfName);

    const standaloneTex = `\\documentclass[tikz,border=4pt]{standalone}
\\usepackage{coursmodern}
\\pagestyle{empty}
\\begin{document}
${tikzSource}
\\end{document}
`;

    fs.writeFileSync(texPath, standaloneTex, 'utf8');

    try {
        console.log(`    Compiling figure ${index + 1} with XeLaTeX...`);
        execSync(`xelatex -interaction=nonstopmode -output-directory="${TMP_DIR}" "${texPath}"`, {
            cwd: ROOT_DIR,
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 30000
        });

        if (!fs.existsSync(pdfPath)) {
            console.warn(`    [Warning] PDF not produced for figure ${index + 1}`);
            return null;
        }

        console.log(`    Converting figure ${index + 1} to vector SVG with MuPDF...`);
        const docData = fs.readFileSync(pdfPath);
        const doc = mupdf.Document.openDocument(docData, 'application/pdf');
        const page = doc.loadPage(0);
        const bounds = page.getBounds();
        const buf = new mupdf.Buffer();
        const writer = new mupdf.DocumentWriter(buf, 'svg', '');
        const dev = writer.beginPage(bounds);
        page.run(dev, mupdf.Matrix.identity);
        writer.endPage();
        writer.close();

        let svgStr = new TextDecoder('utf-8').decode(buf.asUint8Array());
        svgStr = svgStr.replace(/<\?xml[^>]*\?>/gi, '').replace(/<!DOCTYPE[^>]*>/gi, '').trim();

        return svgStr;
    } catch (err) {
        console.warn(`    [Warning] Could not compile TikZ figure ${index + 1}: ${err.message}`);
        return null;
    }
}

/**
 * Parse and convert LaTeX to HTML
 */
export async function convertLatexToHtml(inputTexPath) {
    console.log(`\n======================================================`);
    console.log(`  Converting: ${path.basename(inputTexPath)}`);
    console.log(`======================================================`);

    const startTime = Date.now();
    const rawContent = fs.readFileSync(inputTexPath, 'utf8');

    // ── 1. Extract Document Metadata ────────────────────────────────────────
    console.log('[1/5] Extracting document metadata...');
    const courseTitle = extractMacro(rawContent, 'CourseTitle', 'Titre du Cours');
    const courseSubtitle = extractMacro(rawContent, 'CourseSubtitle', 'Notes de cours');
    const chapterNumber = extractMacro(rawContent, 'ChapterNumber', '');
    const courseAuthor = extractMacro(rawContent, 'CourseAuthor', 'Samy Youssoufine');
    let lastUpdate = extractMacro(rawContent, 'LastUpdate', '\\today');
    if (lastUpdate.includes('today')) {
        lastUpdate = getFrenchDate();
    }
    const primarySite = extractDoubleMacro(rawContent, 'PrimarySite') || {
        text: 'maths2.txt.ma',
        url: 'https://maths2.txt.ma'
    };
    const mirrorSite = extractDoubleMacro(rawContent, 'MirrorSite') || {
        text: 'samy-y.github.io/maths-cpi2a',
        url: 'https://samy-y.github.io/maths-cpi2a'
    };
    const hasWip = /\\wiptrue\b/.test(rawContent) && !/%[^\n]*\\wiptrue\b/.test(rawContent);

    // Label mapping dictionary for \ref{...} resolution
    const labelMap = {};

    // ── 2. Preprocess TikZ Figures ──────────────────────────────────────────
    console.log('[2/5] Processing figures and TikZ graphics...');
    const figures = [];
    let processedContent = rawContent;

    // Remove \usepackage{coursmodern} to avoid pandoc preamble errors
    processedContent = processedContent.replace(/\\usepackage\{coursmodern\}/g, '% [coursmodern omitted for pandoc]');

    // Extract figures: \begin{figure} ... \end{figure}
    const figRegex = /\\begin\{figure\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{figure\}/g;
    processedContent = processedContent.replace(figRegex, (match, body) => {
        const figIdx = figures.length;
        
        let caption = '';
        let label = `fig-${figIdx + 1}`;

        // Extract balanced caption
        const capIdx = body.indexOf('\\caption');
        if (capIdx !== -1) {
            const openBrace = body.indexOf('{', capIdx);
            if (openBrace !== -1) {
                const bal = extractBalancedBraces(body, openBrace);
                if (bal) {
                    caption = bal.content.replace(/\\label\{[^}]*\}/g, '').replace(/^%\s*/gm, '').trim();
                }
            }
        }

        const labelMatch = body.match(/\\label\{([^}]+)\}/);
        if (labelMatch) {
            label = labelMatch[1].trim();
            labelMap[label] = `Figure ${figIdx + 1}`;
        }

        // Extract TikZ snippet
        let tikzCode = body;
        const tikzMatch = body.match(/(?:\\tdplotsetmaincoords[^\n]*\n)?\s*\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/);
        if (tikzMatch) {
            tikzCode = tikzMatch[0];
        }

        const svg = compileTikZToSvg(tikzCode, figIdx);

        figures.push({
            id: label,
            caption,
            svg
        });

        return `\n\n\\begin{coursfig${figIdx}}\\end{coursfig${figIdx}}\n\n`;
    });

    // ── 3. Extract and Tokenize Environments ────────────────────────────────
    console.log('[3/5] Tokenizing coursmodern.sty environments...');
    const envCards = [];
    const envCounters = {};

    function getCounter(envType) {
        if (!envCounters[envType]) envCounters[envType] = 0;
        envCounters[envType]++;
        return envCounters[envType];
    }

    const standardEnvNames = Object.keys(ENV_CONFIG);

    for (const envName of standardEnvNames) {
        const config = ENV_CONFIG[envName];
        const regex = new RegExp(`\\\\begin\\{${envName}\\}(?:\\[([^\\]]*)\\])?(?:\\[([^\\]]*)\\])?([\\s\\S]*?)\\\\end\\{${envName}\\}`, 'g');
        
        processedContent = processedContent.replace(regex, (match, opt1 = '', opt2 = '', body) => {
            const cardIdx = envCards.length;
            const counterNum = config.counter ? getCounter(envName) : null;
            const labelText = config.label + (counterNum ? ` ${counterNum}` : '');

            let title = '';
            let stars = '';
            let cardId = `${envName}-${counterNum || cardIdx + 1}`;

            const labelMatch = body.match(/\\label\{([^}]+)\}/);
            if (labelMatch) {
                cardId = labelMatch[1].trim();
                labelMap[cardId] = labelText;
            } else {
                labelMap[cardId] = labelText;
            }

            if (config.hasStars) {
                if (opt2) {
                    stars = opt1.trim();
                    title = opt2.trim();
                } else if (/^\d+$/.test(opt1.trim())) {
                    stars = opt1.trim();
                } else {
                    title = opt1.trim();
                }
            } else {
                title = opt1.trim();
            }

            envCards.push({
                type: envName,
                label: labelText,
                icon: config.icon,
                color: config.color,
                title,
                stars,
                cardId
            });

            return `\n\n\\begin{coursenv${cardIdx}}\n${body}\n\nCOURSENVENDMARKER${cardIdx}\n\\end{coursenv${cardIdx}}\n\n`;
        });
    }

    // Handle customenv: \begin{customenv}{icon}{name}[color][title]
    const customEnvRegex = /\\begin\{customenv\}\{([^}]*)\}\{([^}]*)\}(?:\[([^\]]*)\])?(?:\[([^\]]*)\])?([\s\S]*?)\\end\{customenv\}/g;
    processedContent = processedContent.replace(customEnvRegex, (match, iconMacro, envName, colorArg = 'swissdark', titleArg = '', body) => {
        const cardIdx = envCards.length;
        const iconClass = FA_MAP[iconMacro.trim()] || 'fas fa-bookmark';
        const color = COLOR_MAP[colorArg.trim()] || colorArg.trim() || '#334155';
        let cardId = `customenv-${cardIdx + 1}`;

        const labelMatch = body.match(/\\label\{([^}]+)\}/);
        if (labelMatch) {
            cardId = labelMatch[1].trim();
            labelMap[cardId] = envName.trim();
        }

        envCards.push({
            type: 'customenv',
            label: envName.trim(),
            icon: iconClass,
            color,
            title: titleArg.trim(),
            stars: '',
            cardId
        });

        return `\n\n\\begin{coursenv${cardIdx}}\n${body}\n\nCOURSENVENDMARKER${cardIdx}\n\\end{coursenv${cardIdx}}\n\n`;
    });

    // Handle proof: \begin{proof} ... \end{proof}
    const proofRegex = /\\begin\{proof\}([\s\S]*?)\\end\{proof\}/g;
    const proofBlocks = [];
    processedContent = processedContent.replace(proofRegex, (match, body) => {
        const proofIdx = proofBlocks.length;
        proofBlocks.push(body);
        return `\n\n\\begin{coursproof${proofIdx}}\n${body}\n\nCOURSPROOFENDMARKER${proofIdx}\n\\end{coursproof${proofIdx}}\n\n`;
    });

    // Handle \todo{...}
    const todoBlocks = [];
    let todoMatch;
    const todoPattern = '\\todo';
    let searchStart = 0;
    while ((todoMatch = processedContent.indexOf(todoPattern, searchStart)) !== -1) {
        const openBrace = processedContent.indexOf('{', todoMatch + todoPattern.length);
        if (openBrace === -1) {
            searchStart = todoMatch + todoPattern.length;
            continue;
        }
        const bal = extractBalancedBraces(processedContent, openBrace);
        if (bal) {
            const todoIdx = todoBlocks.length;
            const text = bal.content.trim();
            todoBlocks.push(text);
            const token = `\\begin{courstodo${todoIdx}}\n${text}\n\nCOURSTODOENDMARKER${todoIdx}\n\\end{courstodo${todoIdx}}`;
            processedContent = processedContent.substring(0, todoMatch) + token + processedContent.substring(bal.endPos + 1);
            searchStart = todoMatch + token.length;
        } else {
            searchStart = todoMatch + todoPattern.length;
        }
    }

    // Remove cover and TOC macros from body
    processedContent = processedContent
        .replace(/\\MakeSwissCover/g, '')
        .replace(/\\tableofcontents/g, '');

    // Normalize French math intervals: [\![ to \llbracket and ]\!] to \rrbracket
    processedContent = processedContent
        .replace(/\[\\!\[/g, '\\llbracket ')
        .replace(/\]\\!\]/g, '\\rrbracket ');

    // ── 4. Pandoc Compilation ───────────────────────────────────────────────
    console.log('[4/5] Compiling LaTeX to HTML with Pandoc...');
    const pandocInputPath = path.join(TMP_DIR, 'pandoc_in.tex');
    const pandocOutputPath = path.join(TMP_DIR, 'pandoc_out.html');

    fs.writeFileSync(pandocInputPath, processedContent, 'utf8');

    execSync(
        `pandoc -f latex -t html --mathjax "${pandocInputPath}" -o "${pandocOutputPath}"`,
        {
            cwd: ROOT_DIR,
            stdio: ['ignore', 'pipe', 'pipe']
        }
    );

    let htmlBody = fs.readFileSync(pandocOutputPath, 'utf8');

    // ── 5. Post-process HTML and Assemble Final Document ───────────────────
    console.log('[5/5] Assembling Swiss Modern HTML page...');

    // Replace environment wrappers with Swiss Modern cards (both opening and closing tags)
    for (let i = 0; i < envCards.length; i++) {
        const env = envCards[i];
        const openTagRegex = new RegExp(`<div class="coursenv${i}">`, 'g');
        const endMarkerRegex = new RegExp(`(?:<p>\\s*)?COURSENVENDMARKER${i}(?:\\s*<\\/p>)?\\s*<\\/div>`, 'g');
        
        const starsHtml = env.stars ? generateStarsHtml(env.stars) : '';
        
        // Convert any \ref inside title
        let cleanTitle = env.title;
        cleanTitle = cleanTitle.replace(/\\ref\{([^}]+)\}/g, (m, refId) => {
            const refText = labelMap[refId] || refId;
            return `<a href="#${refId}" class="xref">${refText}</a>`;
        });

        const titleHtml = cleanTitle ? `<span class="env-title">(${cleanTitle})</span>` : '';

        const openingHtml = `
<div class="env-card env-${env.type}" id="${env.cardId}" style="--env-color:${env.color};">
    <div class="env-header">
        <div class="env-accent-pills">
            <span class="env-pill"></span>
            <span class="env-pill"></span>
        </div>
        <div class="env-badge">
            <i class="${env.icon}" aria-hidden="true"></i>
            <span>${env.label}</span>
            ${starsHtml}
        </div>
        ${titleHtml}
    </div>
    <div class="env-body">`;

        htmlBody = htmlBody.replace(openTagRegex, openingHtml);
        htmlBody = htmlBody.replace(endMarkerRegex, '    </div>\n</div>');
    }

    // Replace proof blocks with QED mark and proper closing
    for (let i = 0; i < proofBlocks.length; i++) {
        const openProofRegex = new RegExp(`<div class="coursproof${i}">`, 'g');
        const endProofRegex = new RegExp(`(?:<p>\\s*)?COURSPROOFENDMARKER${i}(?:\\s*<\\/p>)?\\s*<\\/div>`, 'g');
        
        htmlBody = htmlBody.replace(openProofRegex, '\n<div class="proof-box">\n    <div class="proof-header">Démonstration</div>');
        htmlBody = htmlBody.replace(endProofRegex, '    <div class="proof-qed">&#9632;</div>\n</div>');
    }

    // Replace todo blocks
    for (let i = 0; i < todoBlocks.length; i++) {
        const openTodoRegex = new RegExp(`<div class="courstodo${i}">`, 'g');
        const endTodoRegex = new RegExp(`(?:<p>\\s*)?COURSTODOENDMARKER${i}(?:\\s*<\\/p>)?\\s*<\\/div>`, 'g');
        
        htmlBody = htmlBody.replace(openTodoRegex, '\n<div class="todo-box">\n    <span class="todo-badge"><i class="fas fa-pen-square" aria-hidden="true"></i> À RECOPIER</span>\n');
        htmlBody = htmlBody.replace(endTodoRegex, '</div>');
    }

    // Replace figure blocks
    for (let i = 0; i < figures.length; i++) {
        const fig = figures[i];
        const figTagRegex = new RegExp(`<div class="coursfig${i}">[\\s\\S]*?<\\/div>`, 'g');
        
        let figureHtml = '';
        if (fig.svg) {
            figureHtml = `
<figure class="tex-figure" id="${fig.id}">
    <div class="fig-wrapper">
        ${fig.svg}
    </div>
    ${fig.caption ? `<figcaption>${fig.caption}</figcaption>` : ''}
</figure>`;
        } else {
            figureHtml = `
<figure class="tex-figure" id="${fig.id}">
    <div class="fig-wrapper" style="padding:2rem; background:#f8fafc; border:1px dashed #cbd5e1;">
        <p style="color:#64748b; font-size:0.9rem;"><i class="fas fa-image"></i> Figure vectorielle [${fig.id}]</p>
    </div>
    ${fig.caption ? `<figcaption>${fig.caption}</figcaption>` : ''}
</figure>`;
        }

        htmlBody = htmlBody.replace(figTagRegex, figureHtml);
    }

    // Resolve any remaining \ref{...} in document body
    htmlBody = htmlBody.replace(/\\ref\{([^}]+)\}/g, (m, refId) => {
        const refText = labelMap[refId] || refId;
        return `<a href="#${refId}" class="xref">${refText}</a>`;
    });

    // Extract headings for Table of Contents
    const tocItems = [];
    const headingRegex = /<h([1-3])\s+id="([^"]+)">([\s\S]*?)<\/h\1>/g;
    let hMatch;
    while ((hMatch = headingRegex.exec(htmlBody)) !== null) {
        const level = parseInt(hMatch[1], 10);
        const id = hMatch[2];
        const titleText = hMatch[3].replace(/<[^>]+>/g, '').trim();
        tocItems.push({ level, id, titleText });
    }

    // Build TOC HTML
    let tocHtml = '';
    if (tocItems.length > 0) {
        tocHtml = `
<nav class="toc-box" aria-label="Table des matières">
    <h2>Table des matières</h2>
    <ol>`;
        for (const item of tocItems) {
            if (item.level === 1) {
                tocHtml += `<li><a href="#${item.id}"><strong>${item.titleText}</strong></a></li>`;
            } else if (item.level === 2) {
                tocHtml += `<li style="margin-left:1.2rem;"><a href="#${item.id}">${item.titleText}</a></li>`;
            } else if (item.level === 3) {
                tocHtml += `<li style="margin-left:2.4rem; font-size:0.85rem;"><a href="#${item.id}">${item.titleText}</a></li>`;
            }
        }
        tocHtml += `
    </ol>
</nav>`;
    }

    // Build Swiss Header
    const chapterNumStr = chapterNumber ? chapterNumber.padStart(2, '0') : '';
    const headerHtml = `
<header class="swiss-header" role="banner">
    <div class="swiss-subtitle">${courseSubtitle}</div>
    ${chapterNumStr ? `<div class="swiss-chapter-number">${chapterNumStr}</div>` : ''}
    <h1 class="swiss-title">${courseTitle}</h1>
    <hr class="swiss-divider">
    <div class="swiss-meta">
        <div class="meta-group">
            <h3>Auteur</h3>
            <p>${courseAuthor}</p>
            <h3>Dernière mise à jour</h3>
            <p>${lastUpdate}</p>
        </div>
        <div class="meta-group">
            <h3>Dépôt principal</h3>
            <p><a href="${primarySite.url}"><code>${primarySite.text}</code></a></p>
            <h3>Lien miroir</h3>
            <p><a href="${mirrorSite.url}"><code>${mirrorSite.text}</code></a></p>
        </div>
    </div>
</header>`;

    // Build WIP banner if applicable
    const wipBannerHtml = hasWip ? `
<div class="wip-banner" role="note" aria-label="Document en cours de rédaction">
    <div class="wip-stripes"></div>
    <div class="wip-content">
        <i class="fas fa-hard-hat wip-icon" aria-hidden="true"></i>
        <div class="wip-text">
            <strong>WORK IN PROGRESS</strong>
            <p>Ce document est incomplet ou en révision. Certaines sections peuvent faire l'objet de modifications ultérieures.</p>
        </div>
    </div>
</div>` : '';

    // Build Footer
    const footerHtml = `
<footer class="swiss-footer" role="contentinfo">
    <div>&copy; ${courseAuthor} &bull; EMINES &bull; Class2030</div>
    <div>Généré via <code>coursmodern</code> workflow &bull; <a href="index.html">Index</a></div>
</footer>`;

    // Load styles & template
    const stylesCss = fs.readFileSync(path.join(TOOLS_DIR, 'styles.css'), 'utf8');
    const templateHtml = fs.readFileSync(path.join(TOOLS_DIR, 'template.html'), 'utf8');

    // Page title and description
    const pageTitle = `${chapterNumStr ? `CH${chapterNumStr} — ` : ''}${courseTitle} — TXT.MA`;
    const pageDesc = `${courseTitle} — ${courseSubtitle}`;

    // Fill template
    let finalHtml = templateHtml
        .replace('{{PAGE_TITLE}}', pageTitle)
        .replace('{{PAGE_DESCRIPTION}}', pageDesc)
        .replace('{{AUTHOR}}', courseAuthor)
        .replace('{{INLINE_STYLES}}', stylesCss)
        .replace('{{HEADER_BLOCK}}', headerHtml)
        .replace('{{WIP_BANNER}}', wipBannerHtml)
        .replace('{{TOC_BLOCK}}', tocHtml)
        .replace('{{CONTENT_BODY}}', htmlBody)
        .replace('{{FOOTER_BLOCK}}', footerHtml);

    // Determine output file path
    const outputFilename = path.basename(inputTexPath, path.extname(inputTexPath)) + '.html';
    const outputPath = path.join(ROOT_DIR, outputFilename);

    fs.writeFileSync(outputPath, finalHtml, 'utf8');

    // Clean up temporary files
    try {
        const tmpFiles = fs.readdirSync(TMP_DIR);
        for (const file of tmpFiles) {
            fs.unlinkSync(path.join(TMP_DIR, file));
        }
    } catch (cleanErr) {
        // Ignore cleanup errors
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✓ SUCCESS: Generated "${outputFilename}" (${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB) in ${duration}s`);
    return outputPath;
}

// ── CLI Execution ───────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    let targetFile = args[0];

    if (!targetFile) {
        const texFiles = fs.readdirSync(ROOT_DIR).filter(f => f.endsWith('.tex'));
        if (texFiles.length === 0) {
            console.error('Error: No .tex files found in current directory.');
            process.exit(1);
        } else if (texFiles.length === 1) {
            targetFile = path.join(ROOT_DIR, texFiles[0]);
        } else {
            console.log('Multiple .tex files found:');
            texFiles.forEach((f, idx) => console.log(`  [${idx + 1}] ${f}`));
            const defaultTex = texFiles.find(f => f.toLowerCase() === 'ch0.tex') || texFiles[0];
            targetFile = path.join(ROOT_DIR, defaultTex);
            console.log(`Defaulting to: ${defaultTex}`);
        }
    } else {
        targetFile = path.resolve(ROOT_DIR, targetFile);
    }

    if (!fs.existsSync(targetFile)) {
        console.error(`Error: File not found: ${targetFile}`);
        process.exit(1);
    }

    convertLatexToHtml(targetFile)
        .catch(err => {
            console.error('\nConversion failed:', err);
            process.exit(1);
        });
}
