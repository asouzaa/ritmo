import unittest
from pathlib import Path


RAIZ = Path(__file__).resolve().parents[1]


class TestEstruturaProjeto(unittest.TestCase):
    def test_pastas_principais_existem(self):
        for nome in ("front", "back", "testes", "docs"):
            with self.subTest(nome=nome):
                self.assertTrue((RAIZ / nome).is_dir())

    def test_arquivos_de_execucao_existem(self):
        self.assertTrue((RAIZ / "front" / "package.json").is_file())
        self.assertTrue((RAIZ / "back" / "main.py").is_file())
        self.assertTrue((RAIZ / ".github" / "workflows" / "publicar.yml").is_file())
