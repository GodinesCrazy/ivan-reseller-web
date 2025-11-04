const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

console.log('📄 Generando PDF del Manual Completo...\n');

const markdownPath = path.join(__dirname, 'MANUAL_COMPLETO.md');
const pdfPath = path.join(__dirname, 'MANUAL_COMPLETO.pdf');

// Verificar que existe el archivo markdown
if (!fs.existsSync(markdownPath)) {
    console.error('❌ Error: No se encuentra MANUAL_COMPLETO.md');
    process.exit(1);
}

console.log('📖 Leyendo manual...');
console.log(`   Archivo: ${markdownPath}`);
console.log(`   Tamaño: ${(fs.statSync(markdownPath).size / 1024).toFixed(2)} KB\n`);

console.log('🔄 Convirtiendo a PDF...');
console.log('   Esto puede tomar 1-2 minutos...\n');

// Comando para generar PDF con opciones de formato
const command = `markdown-pdf "${markdownPath}" -o "${pdfPath}" --remarkable-options "{ \\"html\\": true, \\"breaks\\": true }"`;

exec(command, (error, stdout, stderr) => {
    if (error) {
        console.error(`❌ Error al generar PDF: ${error.message}`);
        console.error('\n💡 Alternativa: Usa la extensión "Markdown PDF" en VS Code:');
        console.error('   1. Abre MANUAL_COMPLETO.md en VS Code');
        console.error('   2. Presiona: Ctrl+Shift+P');
        console.error('   3. Escribe: "Markdown PDF: Export (pdf)"');
        console.error('   4. Presiona Enter');
        return;
    }

    if (fs.existsSync(pdfPath)) {
        const pdfSize = (fs.statSync(pdfPath).size / 1024).toFixed(2);
        console.log('✅ PDF generado exitosamente!\n');
        console.log('📊 Información del PDF:');
        console.log(`   Ubicación: ${pdfPath}`);
        console.log(`   Tamaño: ${pdfSize} KB`);
        console.log('\n📬 Ahora puedes compartir este PDF con tus usuarios!\n');
    } else {
        console.error('❌ El PDF no se generó correctamente');
    }
});
