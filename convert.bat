@echo off
setlocal enabledelayedexpansion

title Convertisseur coursmodern LaTeX vers HTML

echo.
echo  =======================================================
echo    coursmodern LaTeX vers HTML - Convertisseur
echo  =======================================================
echo.

:: 1. Verify Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERREUR] Node.js n'a pas ete trouve dans le PATH.
    echo Veuillez verifier que Node.js est installe.
    echo.
    if "%CI%"=="" pause
    exit /b 1
)

:: 2. Verify Pandoc
where pandoc >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERREUR] Pandoc n'a pas ete trouve dans le PATH.
    echo Veuillez verifier que Pandoc est installe.
    echo.
    if "%CI%"=="" pause
    exit /b 1
)

:: 3. Determine target file
set "TARGET_FILE=%~1"

if "%TARGET_FILE%"=="" (
    set /a count=0
    for %%f in (*.tex) do (
        set /a count+=1
        set "LAST_TEX=%%f"
    )

    if !count! equ 0 (
        echo [ERREUR] Aucun fichier .tex trouve dans le dossier.
        echo Glissez-deposez un fichier .tex sur convert.bat ou lancez :
        echo   convert.bat "nom_du_fichier.tex"
        echo.
        if "%CI%"=="" pause
        exit /b 1
    )

    if !count! equ 1 (
        set "TARGET_FILE=!LAST_TEX!"
        echo Fichier LaTeX detecte : !TARGET_FILE!
    ) else (
        echo Plusieurs fichiers .tex trouves dans le dossier :
        echo.
        set /a i=0
        for %%f in (*.tex) do (
            set /a i+=1
            echo   [!i!] %%f
            set "FILE_!i!=%%f"
        )
        echo   [A] Tout convertir
        echo.
        set /p "CHOICE=Votre choix [1-!count! ou A] (defaut: 1) : "
        if "!CHOICE!"=="" set "CHOICE=1"
        if /i "!CHOICE!"=="A" (
            echo.
            echo Conversion de tous les fichiers .tex...
            for %%f in (*.tex) do (
                echo.
                node tools/converter.js "%%f"
                if !errorlevel! neq 0 (
                    echo [ATTENTION] Erreur lors de la conversion de %%f
                )
            )
            echo.
            echo =======================================================
            echo   Toutes les conversions sont terminees !
            echo =======================================================
            echo.
            if "%CI%"=="" pause
            exit /b 0
        )

        set "TARGET_FILE=!FILE_%CHOICE%!"
        if "!TARGET_FILE!"=="" set "TARGET_FILE=!FILE_1!"
    )
)

echo.
echo Execution du workflow sur : "%TARGET_FILE%"
echo.

node tools/converter.js "%TARGET_FILE%"
if %errorlevel% neq 0 (
    echo.
    echo [ERREUR] La conversion a echoue.
    echo.
    if "%CI%"=="" pause
    exit /b %errorlevel%
)

:: Calculate output HTML filename
for %%F in ("%TARGET_FILE%") do set "OUT_HTML=%%~dpnF.html"

echo.
echo =======================================================
echo   Page HTML generee avec succes :
echo   %OUT_HTML%
echo =======================================================
echo.

if "%CI%"=="" (
    set /p "OPEN_BROWSER=Ouvrir la page dans le navigateur ? (O/n) : "
    if "!OPEN_BROWSER!"=="" set "OPEN_BROWSER=O"
    if /i "!OPEN_BROWSER!"=="O" (
        start "" "%OUT_HTML%"
    )
)
