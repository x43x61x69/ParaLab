/* Generated from feld/VERSION by gen_version.py. */
#ifndef PARAMIX_VERSION_H
#define PARAMIX_VERSION_H
#define PARAMIX_VERSION "0.2.141"
#ifndef HOST
#ifdef __ELF__
#define PARAMIX_VERSION_SECTION __attribute__((section(".pmxversion")))
#else
#define PARAMIX_VERSION_SECTION
#endif
static const char paramix_version_tag[] __attribute__((used)) PARAMIX_VERSION_SECTION = "PMXVER:0.2.141";
#undef PARAMIX_VERSION_SECTION
#endif
#endif
