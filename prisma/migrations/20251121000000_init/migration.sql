-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "veiculos" (
    "id" TEXT NOT NULL,
    "placa" TEXT NOT NULL,
    "versao" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "ano" TEXT NOT NULL,
    "cor" TEXT NOT NULL,
    "km" INTEGER NOT NULL,
    "dias_estoque" INTEGER NOT NULL,
    "loja" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "fipe" INTEGER NOT NULL,
    "anuncio_atacado" INTEGER NOT NULL,
    "utilizacao" TEXT NOT NULL,
    "empresa" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "veiculos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imagens" (
    "id" TEXT NOT NULL,
    "veiculo_id" TEXT NOT NULL,
    "dados" BYTEA NOT NULL,
    "mime_type" TEXT NOT NULL,
    "tamanho_bytes" INTEGER NOT NULL,
    "largura" INTEGER NOT NULL,
    "altura" INTEGER NOT NULL,
    "ordem" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imagens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "veiculos_placa_key" ON "veiculos"("placa");

-- CreateIndex
CREATE INDEX "imagens_veiculo_id_idx" ON "imagens"("veiculo_id");

-- CreateIndex
CREATE UNIQUE INDEX "imagens_veiculo_id_ordem_key" ON "imagens"("veiculo_id", "ordem");

-- AddForeignKey
ALTER TABLE "imagens" ADD CONSTRAINT "imagens_veiculo_id_fkey" FOREIGN KEY ("veiculo_id") REFERENCES "veiculos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

