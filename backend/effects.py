import random


def ken_burns_filter(
    duration: float,
    width: int = 1920,
    height: int = 1080,
    fps: int = 25,
    style: str | None = None,
) -> str:
    """Builds a zoompan filter expression for still images."""
    frames = max(1, int(duration * fps))

    styles = {
        "center_zoom_in": (
            f"zoompan=z='min(zoom+0.0009,1.24)':"
            f"x='iw/2-(iw/zoom/2)':"
            f"y='ih/2-(ih/zoom/2)':"
            f"d={frames}:s={width}x{height}:fps={fps}"
        ),
        "gentle_right_pan": (
            f"zoompan=z='1.14':"
            f"x='(iw-iw/zoom)*on/{frames}':"
            f"y='ih/2-(ih/zoom/2)':"
            f"d={frames}:s={width}x{height}:fps={fps}"
        ),
        "zoom_out_drift": (
            f"zoompan=z='max(1.02,1.22-on*0.0007)':"
            f"x='iw/2-(iw/zoom/2)-on*0.20':"
            f"y='ih/2-(ih/zoom/2)-on*0.10':"
            f"d={frames}:s={width}x{height}:fps={fps}"
        ),
    }

    selected = style if style in styles else random.choice(list(styles))
    return styles[selected]

