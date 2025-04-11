from django import template
from django.template.defaultfilters import stringfilter
import itertools

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

@register.filter
def first_image(value):
    """
    Gets the first image URL from a comma-separated list.
    Usage: {{ post.image_urls|first_image }}
    """
    if value and isinstance(value, str):
        parts = value.split(',')
        if parts:
            return parts[0].strip()
    return ""

@register.filter
def intcomma(value):
    """
    Converts an integer to a string containing commas.
    Usage: {{ value|intcomma }}
    """
    try:
        orig = str(value)
        new = orig
        if "." in new:
            dec_point_idx = new.index(".")
            new = new[:dec_point_idx]
        if len(new) <= 3:
            return orig
        else:
            parts = []
            while new:
                parts.append(new[-3:])
                new = new[:-3]
            parts.reverse()
            return ','.join(parts) + orig[len(''.join(parts)):]
    except (ValueError, TypeError):
        return value

@register.filter
def percof(value, arg):
    """
    Calculates what percentage value is of the total arg.
    Usage: {{ value|percof:total }}
    
    Example: 
        {{ 10|percof:50 }} => 20
        {{ 25|percof:100 }} => 25
        {{ sentiment_bins.positive|percof:sentiment_bins.values }} => percentage of positive sentiment
    """
    try:
        if isinstance(arg, dict):
            # If arg is a dictionary, calculate the sum of its values
            total = sum(arg.values())
        elif hasattr(arg, '__iter__') and not isinstance(arg, str):
            # If arg is an iterable (like a list), calculate the sum
            total = sum(arg)
        else:
            # Otherwise, use the arg as is
            total = float(arg)
            
        if total <= 0:
            return 0
            
        return int((float(value) / total) * 100)
    except (ValueError, TypeError, ZeroDivisionError):
        return 0 