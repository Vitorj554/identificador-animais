document.addEventListener("DOMContentLoaded", () => {
    const imageInput = document.getElementById("imageInput");
    const searchInput = document.getElementById("searchInput");
    const searchButton = document.getElementById("searchButton");
    const resultadoDiv = document.getElementById("resultado");

    let model;
    let isProcessing = false;

    // Debounce para busca por texto
    function debounce(func, timeout = 800) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => func.apply(this, args), timeout);
        };
    }

    // 1. Validação de imagem
    function validateImage(file) {
        const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
        const maxSizeMB = 5;
        
        if (!validTypes.includes(file.type)) {
            showError("Formato inválido. Use JPG, PNG ou WebP.");
            return false;
        }
        
        if (file.size > maxSizeMB * 1024 * 1024) {
            showError(`Imagem muito grande (máx. ${maxSizeMB}MB)`);
            return false;
        }
        
        return true;
    }

    // 2. Carregar modelo MobileNet
    async function loadModel() {
        if (model) return model;
        
        try {
            showStatus("<div class='spinner'></div>Carregando IA...");
            model = await mobilenet.load({
                version: 2,
                alpha: 1.0
            });
            return model;
        } catch (error) {
            console.error("Falha no carregamento do modelo:", error);
            showError("Sistema temporariamente indisponível");
            return null;
        }
    }

    // 3. Pré-processamento de imagem
    async function prepareImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            
            img.onload = () => {
                URL.revokeObjectURL(img.src);
                if (img.width < 50 || img.height < 50) {
                    reject(new Error("Imagem muito pequena (mín. 50x50 pixels)"));
                    return;
                }
                
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = 224;
                canvas.height = 224;
                
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, 224, 224);
                
                const ratio = Math.min(224 / img.width, 224 / img.height);
                const newWidth = img.width * ratio;
                const newHeight = img.height * ratio;
                const offsetX = (224 - newWidth) / 2;
                const offsetY = (224 - newHeight) / 2;
                
                ctx.drawImage(img, offsetX, offsetY, newWidth, newHeight);
                resolve(canvas);
            };
            
            img.onerror = () => {
                URL.revokeObjectURL(img.src);
                reject(new Error("Falha ao carregar a imagem"));
            };
            img.src = URL.createObjectURL(file);
        });
    }

    // 4. Identificação do animal
    async function identifyAnimal(file) {
        if (isProcessing) return;
        isProcessing = true;
        
        try {
            if (!validateImage(file)) return;
            
            showStatus("<div class='spinner'></div>Analisando imagem...");
            const model = await loadModel();
            if (!model) return;
            
            const processedImg = await prepareImage(file);
            const predictions = await model.classify(processedImg);
            
            const validResults = predictions.filter(p => 
                p.probability > 0.15 && 
                !p.className.toLowerCase().includes('nematode') &&
                !p.className.toLowerCase().includes('background')
            );
            
            if (validResults.length === 0) {
                throw new Error("Animal não reconhecido (tente outra foto)");
            }
            
            return validResults[0].className.split(',')[0].trim();
        } catch (error) {
            console.error("Erro na identificação:", error);
            throw error;
        } finally {
            isProcessing = false;
        }
    }

    // 5. Busca na Wikipedia
    async function buscarWikipedia(animal) {
        try {
            showStatus("<div class='spinner'></div>Buscando informações...");
            
            // Tenta em português primeiro
            const ptResponse = await fetch(
                `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(animal)}`
            );
            
            if (ptResponse.ok) {
                const data = await ptResponse.json();
                return formatWikipediaData(data, animal);
            }
            
            // Fallback para inglês
            const enResponse = await fetch(
                `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(animal)}`
            );
            
            if (enResponse.ok) {
                const data = await enResponse.json();
                return formatWikipediaData(data, animal, true);
            }
            
            return {
                title: animal,
                description: "Informações não encontradas",
                image: null
            };
            
        } catch (error) {
            console.error("Erro na Wikipedia:", error);
            return {
                title: animal,
                description: "Não foi possível carregar informações",
                image: null
            };
        }
    }

    function formatWikipediaData(data, originalQuery, isEnglish = false) {
        return {
            title: data.title || originalQuery,
            description: isEnglish 
                ? `(English) ${data.extract || data.description || "No description available"}`
                : data.extract || data.description || "Descrição não disponível",
            image: data.thumbnail?.source
        };
    }

    // 6. Exibir resultados
    function showResults(data) {
        clearResults();
        
        let html = `
            <div class="result-card">
                <h3>${data.title}</h3>
        `;
        
        if (data.image) {
            html += `<img src="${data.image}" alt="Imagem ilustrativa de ${data.title}" class="result-image">`;
        }
        
        html += `
                <p>${data.description}</p>
            </div>
        `;
        
        resultadoDiv.innerHTML = html;
    }

    // Funções auxiliares
    function clearResults() {
        resultadoDiv.innerHTML = "";
    }

    function showStatus(message) {
        resultadoDiv.innerHTML = `<div class="status-message">${message}</div>`;
    }

    function showError(message) {
        resultadoDiv.innerHTML = `<div class="error-message">${message}</div>`;
    }

    // Event listeners
    searchButton.addEventListener("click", handleSearch);
    searchInput.addEventListener("input", debounce(handleSearch));
    imageInput.addEventListener("change", handleSearch);

    async function handleSearch() {
        try {
            clearResults();
            
            if (imageInput.files.length) {
                const animal = await identifyAnimal(imageInput.files[0]);
                const info = await buscarWikipedia(animal);
                showResults(info);
            } else if (searchInput.value.trim()) {
                const info = await buscarWikipedia(searchInput.value.trim());
                showResults(info);
            } else {
                showError("Selecione uma imagem ou digite um nome");
            }
        } catch (error) {
            showError(error.message);
        }
    }
});