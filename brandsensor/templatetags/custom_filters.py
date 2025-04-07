from django import template

register = template.Library()

@register.filter
def reverse(value):
    """
    Reverses a list or iterable.
    Usage: {{ my_list|reverse }}
    """
    return list(reversed(value))

@register.filter
def json_parse(value):
    """
    Parses a JSON string into a Python object.
    Usage: {{ json_string|json_parse }}
    """
    import json
    if value:
        try:
            if isinstance(value, dict) or isinstance(value, list):
                # Already parsed, return as is
                return value
            return json.loads(value)
        except (ValueError, TypeError, json.JSONDecodeError) as e:
            print(f"Error parsing JSON: {e} - value: {value[:100]}")
            return {}
    return {}

@register.filter
def sort_by(value, arg):
    """
    Sorts a list of dictionaries or objects by the specified key.
    Usage: {{ items|sort_by:'key' }}
    """
    if not value:
        return []
        
    try:
        # Try to convert the index to an integer
        index = int(arg)
        return sorted(value, key=lambda x: x[index] if isinstance(x, (list, tuple)) and len(x) > index else 0)
    except (ValueError, TypeError):
        # If it's not an integer, use it as a key name
        try:
            return sorted(value, key=lambda x: x.get(arg, 0) if isinstance(x, dict) else getattr(x, arg, 0))
        except (AttributeError, KeyError, TypeError):
            return value

@register.filter
def multiply(value, arg):
    """
    Multiplies the value by the argument.
    Usage: {{ value|multiply:100 }}
    """
    try:
        return float(value) * float(arg)
    except (ValueError, TypeError):
        return 0 