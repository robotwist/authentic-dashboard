from django.test import TestCase
from .models import Brand

class BrandModelTest(TestCase):
    def test_create_brand(self):
        brand = Brand.objects.create(name="Test Brand", domain="https://example.com")
        self.assertEqual(brand.name, "Test Brand")
        self.assertEqual(brand.domain, "https://example.com")
